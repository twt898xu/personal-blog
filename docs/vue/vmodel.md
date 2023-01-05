# v-model 的浅析

> 事件相关请参阅[这里](event.md)

## 编译阶段

在编辑阶段中的`codegen`阶段，会调用`genDirectives`方法，部分定义如下：

```js
function genDirectives(el, state) {
  const dirs = el.directives;
  if (!dirs) return;
  let res = 'directives:[';
  let hasRuntime = false;
  let i, l, dir, needRuntime;
  for (i = 0, l = dirs.length; i < l; i++) {
    dir = dirs[i];
    needRuntime = true;
    const gen: DirectiveFunction = state.directives[dir.name];
    if (gen) {
      // compile-time directive that manipulates AST.
      // returns true if it also needs a runtime counterpart.
      needRuntime = !!gen(el, dir, state.warn);
    }
    //....
  }
}
```

这里通过`state.directives[dir.name]`获取到当前指令的配置方法，并尝试执行。这里会获取到`v-model`的内置实现方法并执行，这段代码在`src/platforms/web/compiler/directives/model.js`内，定义如下：

```js
function model(el, dir) {
  const value = dir.value;
  const modifiers = dir.modifiers;
  const tag = el.tag;
  const type = el.attrsMap.type;
  if (el.component) {
    genComponentModel(el, value, modifiers);
    // component v-model doesn't need extra runtime
    return false;
  } else if (tag === 'select') {
    genSelect(el, value, modifiers);
  } else if (tag === 'input' && type === 'checkbox') {
    genCheckboxModel(el, value, modifiers);
  } else if (tag === 'input' && type === 'radio') {
    genRadioModel(el, value, modifiers);
  } else if (tag === 'input' || tag === 'textarea') {
    genDefaultModel(el, value, modifiers);
  } else if (!config.isReservedTag(tag)) {
    genComponentModel(el, value, modifiers);
    // component v-model doesn't need extra runtime
    return false;
  }
}
```

可以看到这里针对不同的标签和组件都有不同的`v-model`实现方式。我们看一个默认的实现方式`genDefaultModel`

```js
function genDefaultModel(el, value) {
  const type = el.attrsMap.type;

  const { lazy, number, trim } = modifiers || {};
  const needCompositionGuard = !lazy && type !== 'range';
  const event = lazy ? 'change' : type === 'range' ? RANGE_TOKEN : 'input';

  let valueExpression = '$event.target.value';
  if (trim) {
    valueExpression = `$event.target.value.trim()`;
  }
  if (number) {
    valueExpression = `_n(${valueExpression})`;
  }

  let code = genAssignmentCode(value, valueExpression);
  if (needCompositionGuard) {
    code = `if($event.target.composing)return;${code}`;
  }

  addProp(el, 'value', `(${value})`);
  addHandler(el, event, code, null, true);
  if (trim || number) {
    addHandler(el, 'blur', '$forceUpdate()');
  }
}
```

这个方法的核心是给`el.props`和`el.events`添加了 2 个属性，在后续处理`props`和`events`的时候一并进行处理。

`genAssignmentCode`核心逻辑是根据`v-model`绑定的`value`值的不同写法，去决定是直接赋值，还是使用`$set`去实现数据更新。用一个例子来说明这个产出的代码

```html
<input v-model="test" />
```

在经过`codegen`处理后的代码大概如下：

```js
function render() {
  with (this) {
    return _c('input', {
      //...
      domProps: {
        value: test,
      },
      on: {
        input: function ($event) {
          if ($event.target.composing) return;
          test = $event.target.value;
        },
      },
    });
  }
}
```

这里能看出，`v-model`在普通元素上其实就是添加了对应的属性和事件来实现所谓的双向绑定效果。

接着看下在`v-mode`组件上的处理

```js
function genComponentModel(el, value, modifiers) {
  const { number, trim } = modifiers || {};

  const baseValueExpression = '$$v';
  let valueExpression = baseValueExpression;
  if (trim) {
    valueExpression =
      `(typeof ${baseValueExpression} === 'string'` +
      `? ${baseValueExpression}.trim()` +
      `: ${baseValueExpression})`;
  }
  if (number) {
    valueExpression = `_n(${valueExpression})`;
  }
  const assignment = genAssignmentCode(value, valueExpression);

  el.model = {
    value: `(${value})`,
    expression: JSON.stringify(value),
    callback: `function (${baseValueExpression}) {${assignment}}`,
  };
}
```
这里比较简单，就是对`el.model`进行了一个初始化

## 挂载阶段

普通元素其实就是一个事件的挂载，不再做阐述。

组件元素，在元素组件的`vnode`创建阶段，会有这样一段代码在`src/core/vdom/create-component.js`中
```js
function createComponent(){
    //...
    if (isDef(data.model)) {
        transformModel(Ctor.options, data)
    }
    //
}
function transformModel (options, data: any) {
  const prop = (options.model && options.model.prop) || 'value'
  const event = (options.model && options.model.event) || 'input'
  ;(data.attrs || (data.attrs = {}))[prop] = data.model.value
  const on = data.on || (data.on = {})
  const existing = on[event]
  const callback = data.model.callback
  if (isDef(existing)) {
    if (
      Array.isArray(existing)
        ? existing.indexOf(callback) === -1
        : existing !== callback
    ) {
      on[event] = [callback].concat(existing)
    }
  } else {
    on[event] = callback
  }
}
```
可以看到，核心是调用了`transformModel`方法来处理组件的`v-model`指令，将`el.model`中的`callback`添加到当前`vnode`的`on`属性中，就是组件的事件对象中，通过组件事件来实现`v-model`的实现。

## 总结
- `v-model`本质上是事件的语法糖
- 普通元素的实现，是在`codegen`阶段，通过内置的指令解析方法，将`v-model`对应的代码生成对应的原生事件代码
- 组件的事件，`codegen`阶段，通过内置的指令方法将解析出`model`对象字符串拼接到`render`函数中。在组件的`vnode`生成阶段，解析`model`对象，并将对应的事件添加到`vnode`的事件对象中去
