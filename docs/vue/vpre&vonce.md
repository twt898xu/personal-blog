# v-pre 和 v-once 解析

## v-pre

Vue 的官方文档是这样描述这个指令的

> 跳过这个元素和它的子元素的编译过程。可以用来显示原始 Mustache 标签。跳过大量没有指令的节点会加快编译。
> 我们从源码的角度来了解下这个实现的原理

### 编译阶段

#### 源码解析

在`src/compiler/parser/index.js`文件中，生成 ast 的过程中有类似以下代码

```javascript
function parse(template){

    let inVPre = false
    parseHTML(template){
        start(tag,attrs){
            let element = createASTElement(tag,attrs)
            if(!inVPre){
                processPre(element) //就是判断有无v-pre属性，
                if (element.pre) {
                    inVPre = true
                }
            }
            if(inVPre){
                processRawAttrs(element) //将 el.attrsList 复制到 el.attrs 属性上
            }
        },
        chars(text){
            if(text){
                let child
                if(inVPre){
                    child = {
                        type: 3,
                        text
                    }
                }
            }
        }
    }
}
```

可以看到在处理标签的`start`函数内部，判断了当前处理的元素是否有`pre`指令，并更改了一个外部变量`inVPre`。同时对元素的`attrs`做了简单的初始化处理。

在`chars`处理文本的函数中，如果当前`inVPre`成立，则直接将文本当成普通`text`节点处理

我们知道除了`start`函数，ast 生成的阶段中，还会调用`end`函数，我们在看下`end`函数内部的相关逻辑

```javascript
//end函数主要逻辑
function closeElement(element) {
  // 跳过processElement函数的调用
  if (!inVPre && !element.processed) {
    element = processElement(element, options);
  }
  // ... 忽略其他逻辑
  if (element.pre) {
    inVPre = false;
  }
}
```

可以看到在处理标签的闭合阶段，首先根据`inVPre`属性，去跳过了比较复杂的`processElement`方法（这个方法会处理 slot component 属性和事件绑定等）。这也和官方文档的说明对上了，确实是跳过了大量的编译方法。
然后接下来在根据`element.pre`来决定是否将`inVPre`属性还原。因为 html 的解析和 ast 的生成都是深度优先的算法，所以这样就保证了被标记为`v-pre`的子组件也会跳过大量的编译。

#### AST 优化阶段

其实`v-pre`指令远不止官方文档所说的提高编译速度。在编译的第二个阶段 ast 优化阶段，还会根据 ast 的类型给 ast 打上静态标记，我们看下这块逻辑，在`src/compiler/optimizer.js`中

```javascript
function isStatic(node) {
  // ... 忽略部分代码
  return !!(
    node.pre ||
    (!node.hasBindings && // no dynamic bindings
      !node.if &&
      !node.for && // not v-if or v-for or v-else
      !isBuiltInTag(node.tag) && // not a built-in
      isPlatformReservedTag(node.tag) && // not a component
      !isDirectChildOfTemplateFor(node) &&
      Object.keys(node).every(isStaticKey))
  );
}
```

可以看到，当一个节点拥有`node.pre`属性时，就会被标记为一个静态节点,然后根据是否同时满足以下规则标记节点是否是一个`staticRoot`节点.

- 自己是`static`节点（代表自节点也全部是`static`节点）
- 有超过一个 1 子节点，或者唯一的字节点不是文本节点

接下来我们看下`staticRoot`静态节点在 codegen 阶段的作用

#### Codegen 阶段

这段代码在源码的`src/compiler/codegen/index.js`中

```javascript
function genElement(ast, state) {
  if (el.parent) {
    el.pre = el.pre || el.parent.pre; //继承父元素的pre
  }
  if (el.staticRoot && !el.staticProcessed) {
    return genStatic(el, state);
  }
  //省略部分代码
  else {
    //plain 表示没有任何属性
    if (!el.plain || (el.pre && state.maybeComponent(el))) {
      data = genData(el, state);
    }
    const children = el.inlineTemplate ? null : genChildren(el, state, true);
    code = `_c('${el.tag}'${
      data ? `,${data}` : '' // data
    }${
      children ? `,${children}` : '' // children
    })`;
  }
  return code;
}
```

这里我们先看`genStatic`这个逻辑，这是我们希望的命中逻辑

```javascript
function genStatic(el: ASTElement, state: CodegenState): string {
  el.staticProcessed = true;
  const originalPreState = state.pre;
  if (el.pre) {
    state.pre = el.pre;
  }
  state.staticRenderFns.push(`with(this){return ${genElement(el, state)}}`);
  state.pre = originalPreState;
  return `_m(${state.staticRenderFns.length - 1}${
    el.staticInFor ? ',true' : ''
  })`;
}
```

首先将修改了`state.pre`的值，这个主要处理`template`标签的问题

接着调用`genElement`并将返回的 render 函数保存到了`state.staticRenderFns`属性中，然后用`_m`传入刚才 push 进数组的函数序号。然后返回 render 字符串。
这里的`_m`方法定义在`src/core/instance/render-helpers/render-static.js`下面的`renderStatic`方法。

```javascript
export function renderStatic(
  index: number,
  isInFor: boolean,
): VNode | Array<VNode> {
  const cached = this._staticTrees || (this._staticTrees = []);
  let tree = cached[index];
  if (tree && !isInFor) {
    return tree;
  }
  tree = cached[index] = this.$options.staticRenderFns[index].call(
    this._renderProxy,
    null,
    this,
  );
  markStatic(tree, `__static__${index}`, false);
  return tree;
}
```

其实逻辑很简单，就是传入`index`然后取出对应的 render 函数，执行，存入缓存。下一次执行直接从缓存里面取。这样就保证该函数只会被执行一次，从而保证 vNode 不变。

这里需要注意一点是`v-pre`如果包含了一个组件，那么即使该组件是一个`plain`组件，也会调用`genData`方法，在这个场景下这个方法会返回一个包含`pre:true`属性的对象字符串。

### 挂载阶段

在挂载阶段，会调用编译阶段的 render 函数生成对应的 vnode,我们看下这块逻辑，对应的源码在`src/core/vdom/create-element.js`

```javascript
function _createElement(tag,data){
    //省略部分代码
    if(typeof tag === 'string'){
        if(if (config.isReservedTag(tag))){
            //...
        }else if((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))){
            //...
        }else{
            // 未知或未列出的命名空间元素
            // 在运行时检查，因为它可能会在它的时候被分配一个命名空间
            // 父母使孩子正常化
            vnode = new VNode(
                tag, data, children,
                undefined, undefined, context
            )
        }
    }
}
```

`_createElement`函数对应的其实就是`_c`函数。可以看到，当一个组件被标记为`pre`后，是不会执行组件的 vnode 生成逻辑的，而是进入到了未知元素的生成逻辑。

所以如果组件被`v-pre`标记或包裹，则会被当成一个普通元素来创建和挂载。

### 总结

- `v-pre`指令，在编译阶段会跳过大量的指令和属性绑定编译提高了编译速度速度。并且会被标记为`static`。
- 在 render 函数生成阶段，会根据`staticRoot`标记，将 render 函数包裹到`_m`函数中，这个函数会缓存真正 render 函数的执行结果保证只会执行一次
- 如果组件被`v-pre`标记，则会在 vnode 生成阶段跳过组件的 vnode 生成，直接生成一个位置元素的 vnode，当成普通元素挂载

## v-once
> 只渲染元素和组件一次。随后的重新渲染，元素/组件及其所有的子节点将被视为静态内容并跳过。这可以用于优化更新性能。

`v-once`的原理比较简单，分以下几步
- html解析阶段解析出`v-once`指令，给ast node添加`once`属性
- codegen阶段判断是否有`once`属性，如果有进入`genOnce`方法，调用核心的`_m`函数，将render运行结果缓存
- codegen阶段需要判断`v-if`和`v-for`的情况，处理一些细节问题

## 补充说明
- `_m`函数会给vnode标记上`isStatic` `isOnce`这些属性
- `pacthVnode`会比较以上字段来来判断是够需要进行diff
