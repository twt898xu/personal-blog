# 浅析 slot

> 因为从2.6.0起官方已经放弃使用`slot` 和 `slot-scope`属性，所以我们这里只分析`v-slot`语法

## 普通 slot

### 编译阶段

举一个例子方便说明

```html
<!-- parent.vue -->
<div><slot name="foo"> default foo</slot></div>
<!-- child.vue -->
<parent> <div slot="foo">new foo</div> </parent>
```

首先当在 html 的解析阶段，首先会解析到 parent 组件`slot`标签，在`src/compiler/parser/index.js`中的`processSlotOutlet`方法内

```js
function processSlotOutlet(el) {
  if (el.tag === 'slot') {
    el.slotName = getBindingAttr(el, 'name');
  }
}
```

这段代码就是简单的给 ast 对象添加一个`slotName`属性

接着看下 child 组件的解析，对象代码在`src/compiler/parser/index.js`中的`processSlotContent`方法内，我们只看与普通`slot`相关的逻辑

```js
function processSlotContent(el) {
  //只与slot相关逻辑
  const slotTarget = getBindingAttr(el, 'slot');
  if (slotTarget) {
    el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget;
    el.slotTargetDynamic = !!(
      el.attrsMap[':slot'] || el.attrsMap['v-bind:slot']
    );
    // preserve slot as an attribute for native shadow DOM compat
    // only for non-scoped slots.
    if (el.tag !== 'template' && !el.slotScope) {
      addAttr(el, 'slot', slotTarget, getRawBindingAttr(el, 'slot'));
    }
  }
}
```

也是给 ast 对象添加了 2 个属性`slotTarget` `slotTargetDynamic`

接着看一下`codegen`阶段分别对父子组件的处理，先看父组件,代码在`src/compiler/codegen/index.js`中，`el.tag === 'slot'`的 ast 会调用`genSlot`方法

```js
function genSlot(el: ASTElement, state: CodegenState): string {
  const slotName = el.slotName || '"default"';
  const children = genChildren(el, state);
  let res = `_t(${slotName}${
    children ? `,function(){return ${children}}` : ''
  }`;
  const attrs =
    el.attrs || el.dynamicAttrs
      ? genProps(
          (el.attrs || []).concat(el.dynamicAttrs || []).map((attr) => ({
            // slot props are camelized
            name: camelize(attr.name),
            value: attr.value,
            dynamic: attr.dynamic,
          })),
        )
      : null;
  const bind = el.attrsMap['v-bind'];
  if ((attrs || bind) && !children) {
    res += `,null`;
  }
  if (attrs) {
    res += `,${attrs}`;
  }
  if (bind) {
    res += `${attrs ? '' : ',null'},${bind}`;
  }
  return res + ')';
}
```

这段代码的核心是返回了一个`_t`函数调用的字符串，其中分别处理了`name` `child` `attrs` `bind`等属性，我们看下`_t`这个函数，在`src/core/instance/render-helpers/render-slot.js`下，只看下普通 slot 相关的逻辑

```js
export function renderSlot(
  name: string,
  fallbackRender: ?((() => Array<VNode>) | Array<VNode>),
  props: ?Object,
  bindObject: ?Object,
): ?Array<VNode> {
  let nodes;
  nodes =
    this.$slots[name] ||
    (typeof fallbackRender === 'function' ? fallbackRender() : fallbackRender);

  return nodes;
}
```
可以看到`_t`函数的本质就是根据传入的`name`参数，从当前实例的`$slots`属性中取出对应的`vnode`

接着我们看下这个`$slots`书是从哪里来的，在组件实例化的时候会去执行`initRender`方法，在`src/core/instance/render.js`中
```js
function initRender(vm){
    //...
    vm.$slots = resolveSlots(options._renderChildren, renderContext)
    //...
}

export function resolveSlots (
  children: ?Array<VNode>,
  context: ?Component
): { [key: string]: Array<VNode> } {
  if (!children || !children.length) {
    return {}
  }
  const slots = {}
  for (let i = 0, l = children.length; i < l; i++) {
    const child = children[i]
    const data = child.data
    // remove slot attribute if the node is resolved as a Vue slot node
    if (data && data.attrs && data.attrs.slot) {
      delete data.attrs.slot
    }
    // named slots should only be respected if the vnode was rendered in the
    // same context.
    if ((child.context === context || child.fnContext === context) &&
      data && data.slot != null
    ) {
      const name = data.slot
      const slot = (slots[name] || (slots[name] = []))
      if (child.tag === 'template') {
        slot.push.apply(slot, child.children || [])
      } else {
        slot.push(child)
      }
    } else {
      (slots.default || (slots.default = [])).push(child)
    }
  }
  // ignore slots that contains only whitespace
  for (const name in slots) {
    if (slots[name].every(isWhitespace)) {
      delete slots[name]
    }
  }
  return slots
}
```
`resolveSlots`的作用就是循环组件`child`属性，将组件内部的所以元素按照有无`slot`属性添加到对应的具名或者`default`属性中

上面的例子中，生成的`render`函数如下
```js
//parent
function render() {
  with(this) {
    return _c('div', [_t("foo", function () {
      return [_v(" default foo")]
    })], 2)
  }
}
//child
function render() {
  with(this) {
    return _c('parent', [_c('div', {
      attrs: {
        "slot": "foo"
      },
      slot: "foo"
    }, [_v("new foo")])])
  }
}
```
所以，slot就是子组件