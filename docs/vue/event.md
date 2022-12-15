# Vue Event 的浅析

## 编译阶段

### HTML 解析阶段

我们还是从 vue 的编译阶段开始分析 vue 事件的处理方式

之前分析过，在`html-parse`阶段处理标签的闭合阶段会调用`processElement`方法来处理标签元素上的绑定，该方法内部会调用`processAttrs`来处理事件等相关绑定。代码在`src/compiler/parse/index.js`内

```javascript
function processAttrs(el) {
  const list = el.attrsList;
  let i, l, name, rawName, value, modifiers, syncGen, isDynamic;
  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name;
    value = list[i].value;
    if (dirRE.test(name)) {
      el.hasBindings = true;
      modifiers = parseModifiers(name.replace(dirRE, '')); //绑定的修饰符 exp:{ stop:true,native:true }
      if (onRE.test(name)) {
        // v-on
        name = name.replace(onRE, '');
        isDynamic = dynamicArgRE.test(name);
        if (isDynamic) {
          name = name.slice(1, -1);
        }
        addHandler(el, name, value, modifiers, false, warn, list[i], isDynamic);
      }
    }
  }
}
```

这里可以看到，处理事件的核心是是调用了`addHandler`方法，同时传入事件的修饰符等属性。接着看下`addHandler`的实现，该方法位于`src/compiler/helpers.js`下

```javascript
function addHandler(
  el: ASTElement,
  name: string,
  value: string,
  modifiers: ?ASTModifiers,
  important?: boolean,
  warn?: ?Function,
  range?: Range,
  dynamic?: boolean,
) {
  modifiers = modifiers || emptyObject;
  if (modifiers.right) {
    //处理right修饰符事件
  } else if (modifiers.middle) {
    //处理middle修饰符事件
  }
  if (modifiers.capture) {
    delete modifiers.capture;
    name = prependModifierMarker('!', name, dynamic);
  }
  if (modifiers.once) {
    delete modifiers.once;
    name = prependModifierMarker('~', name, dynamic);
  }
  if (modifiers.passive) {
    delete modifiers.passive;
    name = prependModifierMarker('&', name, dynamic);
    //prependModifierMarker 方法，根据事件名是否是动态的 做一些修饰符的处理
  }
  let events;
  if (modifiers.native) {
    delete modifiers.native;
    events = el.nativeEvents || (el.nativeEvents = {});
  } else {
    events = el.events || (el.events = {});
  }
  const newHandler: any = rangeSetItem({ value: value.trim(), dynamic }, range); //设置属性节点的start end
  if (modifiers !== emptyObject) {
    newHandler.modifiers = modifiers;
  }

  const handlers = events[name];
  if (Array.isArray(handlers)) {
    important ? handlers.unshift(newHandler) : handlers.push(newHandler);
  } else if (handlers) {
    events[name] = important ? [newHandler, handlers] : [handlers, newHandler];
  } else {
    events[name] = newHandler;
  }

  el.plain = false;
}
```

可以看到，首先是对事件的部分修饰符做了一些前置处理，这些处理主要是修改事件的`name`属性。然后根据是否有`native`修饰符，将事件添加到了改 ast 节点的`nativeEvents`或者`events`属性中。然后再根据事件是否存在或是否是`important`事件，完成对 ast 事件属性的修改。

### codegen 阶段

接着我们看在`render`函数生成阶段对事件的处理

根据我们之前的了解，`codegen`中有一个十分重要的方法调用`genData`。位于`src/compiler/codegen/index.js`下

```javascript
function genData(el, state) {
  if (el.events) {
    data += `${genHandlers(el.events, false)},`;
  }
  if (el.nativeEvents) {
    data += `${genHandlers(el.nativeEvents, true)},`;
  }
}
```

可以看到这里是先后处理了 ast 节点上的`events` `nativeEvents`2 个属性。接着我们看下`genHandlers`方法的实现

```javascript
function genHandlers(events: ASTElementHandlers, isNative: boolean) {
  const prefix = isNative ? 'nativeOn:' : 'on:';
  let staticHandlers = ``;
  let dynamicHandlers = ``;
  for (const name in events) {
    const handlerCode = genHandler(events[name]);
    if (events[name] && events[name].dynamic) {
      dynamicHandlers += `${name},${handlerCode},`; //数组格式
    } else {
      staticHandlers += `"${name}":${handlerCode},`; //对象格式
    }
  }
  staticHandlers = `{${staticHandlers.slice(0, -1)}}`;
  if (dynamicHandlers) {
    return prefix + `_d(${staticHandlers},[${dynamicHandlers.slice(0, -1)}])`;
  } else {
    return prefix + staticHandlers;
  }
}
```

可以看到，该方法内部是调用了`genHandler`来返回单个事件的函数字符串。然后根据是否拥有`dynamic`函数，决定返回的字符串格式，如果有`dynamic`函数则直接返回一个函数`_d`函数字符串，静态函数是第一个参数，动态的函数放在一个数组里面作为第二个参数。关于`_d`函数，在`src/core/instance/bind-dynamic-keys.js`下。代码很简单，就是将第二个参数的奇数位作为key,偶数位作为value,循环赋值到第一个参数里面去。可以自己去看一下

接下来我们看下核心的`genHandler`方法的实现：

```javascript
function genHandler() {
  if (!handler) {
    return 'function(){}';
  }
  if (Array.isArray(handler)) {
    return `[${handler.map((handler) => genHandler(handler)).join(',')}]`;
  }
  const isMethodPath = simplePathRE.test(handler.value); //匹配是否是一个函数名
  const isFunctionExpression = fnExpRE.test(handler.value); //匹配是否是一个函数
  const isFunctionInvocation = simplePathRE.test(
    handler.value.replace(fnInvokeRE, ''),
  ); //匹配是否是一个函数体

  if (!handler.modifiers) {
    if (isMethodPath || isFunctionExpression) {
      return handler.value;
    }
    return `function($event){${
      isFunctionInvocation ? `return ${handler.value}` : handler.value
    }}`;
  } else {
    let code = '';
    let genModifierCode = ''; // 修饰符代码
    const keys = [];
    for (const key in handler.modifiers) {
      if (modifierCode[key]) {
        genModifierCode += modifierCode[key]; //获取修饰符对应的实现代码
        if (keyCodes[key]) {
          //键盘事件code
          keys.push(key);
        }
      } else if (key === 'exact') {
        //组合键处理
        const modifiers: ASTModifiers = (handler.modifiers: any);
        genModifierCode += genGuard(
          ['ctrl', 'shift', 'alt', 'meta']
            .filter((keyModifier) => !modifiers[keyModifier])
            .map((keyModifier) => `$event.${keyModifier}Key`)
            .join('||'),
        );
      } else {
        keys.push(key);
      }
    }
    if (keys.length) {
      code += genKeyFilter(keys); //处理键盘的事件
    }
    const handlerCode = isMethodPath
      ? `return ${handler.value}.apply(null, arguments)`
      : isFunctionExpression
      ? `return (${handler.value}).apply(null, arguments)`
      : isFunctionInvocation
      ? `return ${handler.value}`
      : handler.value;
    return `function($event){${code}${handlerCode}}`;
  }
}
```

这里，首先对多个同名事件绑定的情况做了个递归的调用。接着用正则判断了当前事件函数的类型。如果当前事件没有修饰符的话，则根据函数的类型，决定直接返回函数还是包裹一层`function($event){}`进行返回.

接着处理事件有修饰符的情况。当事件含有修饰符的情况下，首先处理 vue 内置的修饰符，获取到修饰符对应的实现代码字符串进行拼接。这部分代码部分如下：

```javascript
const modifierCode = {
  stop: '$event.stopPropagation();',
  prevent: '$event.preventDefault();',
  self: genGuard(`$event.target !== $event.currentTarget`),
  // ....
};
```

可以看到所谓的修饰符其实就是段实现代码的索引

接着判断修饰符中是否有组合键修饰符，过滤`ctrl` `shift` `alt` `meta`4 种组合键的情况。接着通过`genKeyFilter`方法处理其他的修饰符主要一些按键的修饰符。具体不多做阐述。

接着判断了函数的类型，生成不同的执行 code。最后将修饰符的 code 与函数的 code 通过一层`function`函数包裹返回。这样事件在编译阶段的全部工作就结束了。

### 其他

其实在`codegen`阶段，除了上面提到的`events` `nativeEvents`外还有一个地方涉及到了事件的处理

```javascript
function genData(el, state) {
  if (el.events) {
    data += `${genHandlers(el.events, false)},`;
  }
  if (el.nativeEvents) {
    data += `${genHandlers(el.nativeEvents, true)},`;
  }
  // v-on data wrap
  if (el.wrapListeners) {
    data = el.wrapListeners(data);
  }
}
```

这里的`wrapListeners`其实是`v-on`指令在没有指定 event name 情况下会存在的属性。大家可以看下指令的处理方法和`src/compiler/directives/on.js`方法。这个`wrapListeners`最终会在生成的`data`对象外层包裹一个`_g()`的方法调用，具体功能就是在`vnode`生成阶段把`v-on`指定的对象动态的挂载到`vnode`的`on`属性中。接着我们看下在组件挂载阶段的事件处理

## 挂载阶段

### 原始标签元素的事件绑定

先简单的看下 vnode 的钩子函数，在高阶函数`createPatchFunction`方法种，有这样的一段代码

```javascript
const hooks = ['create', 'activate', 'update', 'remove', 'destroy'];

function createPatchFunction(backend) {
  let i, j;
  const cbs = {};
  const { modules, nodeOps } = backend;

  for (i = 0; i < hooks.length; ++i) {
    cbs[hooks[i]] = [];
    for (j = 0; j < modules.length; ++j) {
      if (isDef(modules[j][hooks[i]])) {
        cbs[hooks[i]].push(modules[j][hooks[i]]);
      }
    }
  }
  return function patch() {
    //...
  };
}
```

可以看到首先是根据传入的参数，初始化了一个`cbs`的对象，这个就是 vnode 的钩子函数，钩子函数会在 vnode 的不同阶段调用。`event`相关的钩子函数在`src/platforms/web/runtime/modules/events.js`下面。dom 在创建完成插入到文档前会执行`create`钩子，对应到`event`就是`updateDOMListeners`方法，这个方法核心就是调用了`src/core/vdom/helpers/update-listeners.js`方法

```js
function updateListeners(
  on: Object,
  oldOn: Object,
  add: Function,
  remove: Function,
  createOnceHandler: Function,
  vm: Component,
) {
  let name, def, cur, old, event;
  for (name in on) {
    def = cur = on[name];
    old = oldOn[name];
    event = normalizeEvent(name); // 对 once passive capture 这几个修饰符做处理
    if (isUndef(old)) {
      if (isUndef(cur.fns)) {
        cur = on[name] = createFnInvoker(cur, vm);
      }
      if (isTrue(event.once)) {
        cur = on[name] = createOnceHandler(event.name, cur, event.capture);
      }
      add(event.name, cur, event.capture, event.passive, event.params);
    } else if (cur !== old) {
      old.fns = cur;
      on[name] = old;
    }
  }
  for (name in oldOn) {
    if (isUndef(on[name])) {
      event = normalizeEvent(name);
      remove(event.name, oldOn[name], event.capture);
    }
  }
}

function createFnInvoker(fns, vm) {
  function invoker() {
    const fns = invoker.fns;
    if (Array.isArray(fns)) {
      const cloned = fns.slice();
      for (let i = 0; i < cloned.length; i++) {
        invokeWithErrorHandling(cloned[i], null, arguments, vm, `v-on handler`);
      }
    } else {
      // return handler return value for single handlers
      return invokeWithErrorHandling(fns, null, arguments, vm, `v-on handler`);
    }
  }
  invoker.fns = fns;
  return invoker;
}
```

可以看到首先循环`newVnode`上的事件，判断在`oldVnode`上是否存在。不存在的话则调用`createFnInvoker`方法创建一个方法。注意`createFnInvoker`返回一个函数，并将我们的原始函数作为它的一个属性`fns`，在返回的函数内部调用我们原始的函数。接着调用`add`方法进行事件绑定，这个`add`就是原始的`addEventListener`包装。如果`oldVnode`上存在这个事件绑定，则直接替换掉事件函数的`fns`属性即可，减少了一次绑定调用

接着循环`oldVnode`上的事件，如果`newVnode`上没有定义，则直接移除即可。

### Component 组件的事件绑定

首先在组件的 vnode 生成阶段，会调用`src/core/vdom/create-component.js`内的`createComponent`方法

```js
function createComponent(
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string,
) {
  //...
  const listeners = data.on;
  data.on = data.nativeOn;
  //...

  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data,
    undefined,
    undefined,
    undefined,
    context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory,
  );

  return vnode;
}
```

可以看到，首先将组件的事件`on`赋值给了一个`listeners`变量，接着将`data.nativeOn`赋值给了`data.on`属性。然后将`listeners`作为一个参数传递给了`VNode`构造函数。从这里就将 component 组件的组件事件与 dom 事件进行了区分处理，dom 事件上面已经说过了，我们主要看组件事件`listeners`的处理。

组件的 vnode 构建完成后，接着就到了组件的挂载阶段，会执行到组件的`_init`方法，从而进入到`initInternalComponent`方法。

```js
function initInternalComponent() {
  const opts = (vm.$options = Object.create(vm.constructor.options));
  const parentVnode = options._parentVnode;
  const vnodeComponentOptions = parentVnode.componentOptions;
  opts._parentListeners = vnodeComponentOptions.listeners;
  //...
}
```

从这里可以得知，子组件的`_parentListeners`会存储父组件的`listeners`属性，接着调用`initEvent`方法，定义在`src/core/instance/events.js`中。

```js
function initEvents(vm) {
  vm._events = Object.create(null);
  vm._hasHookEvent = false;
  const listeners = vm.$options._parentListeners; //监听父组件的事件对象
  if (listeners) {
    updateComponentListeners(vm, listeners);
  }
}
```
`updateComponentListeners`核心也是调用`updateListeners`方法，上面已经说过了。主要的区别是这次`add` `remove`这些方法是调用了组件的专用事件处理方法。具体见`eventsMixin`这个方法。核心就是个发布订阅模式，子组件通过`$emit`来调用`$on`注册的事件。

## 总结
- html解析阶段会根据事件的修饰符将事件存入ast的`events`或`nativeEvents`属性中
- codegen 阶段会根据组件的修复符，生成对应的函数字符串，存储在渲染函数data的`on`或`nativeOn`属性
- vonde的生成阶段，如果是组件的话则将`nativeOn`赋值给`on`,将原先的`on`作为参数传递给组件的`VNode`构造函数
- DOM元素挂载阶段，DOM元素创建后,执行vnode的`create`钩子函数，调用原生的事件方法，将事件挂载到dom元素上
- 组件挂载阶段，在组件的初始化阶段中，首先获取到父vnode元素的`listeners`属性，然后在`initEvent`阶段建立自定义的事件绑定
