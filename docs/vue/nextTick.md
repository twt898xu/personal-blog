# $nextTick 的浅析

## nextTick

> 在下次 DOM 更新循环结束之后执行延迟回调。在修改数据之后立即使用这个方法，获取更新后的 DOM。

由于 Vue 中，修改数据后对应的 DOM 不会立即更新，而是会被推入到一个任务队列中异步执行（这个异步实现就是`nextTick`），所以当我们想要获取更新后的 DOM 的话一般使用`$nextTick`来异步获取。对应的代码在`src/core/util/next-tick.js`里，我们来看下这段代码

```js
export let isUsingMicroTask = false; //标记当前是否是使用 microTask 来实现

const callbacks = [];
let pending = false;

function flushCallbacks() {
  pending = false;
  const copies = callbacks.slice(0);
  callbacks.length = 0;
  for (let i = 0; i < copies.length; i++) {
    copies[i]();
  }
}

let timerFunc;

if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve();
  timerFunc = () => {
    p.then(flushCallbacks);
  };
  isUsingMicroTask = true;
} else if (
  !isIE &&
  typeof MutationObserver !== 'undefined' &&
  (isNative(MutationObserver) ||
    MutationObserver.toString() === '[object MutationObserverConstructor]')
) {
  let counter = 1;
  const observer = new MutationObserver(flushCallbacks);
  const textNode = document.createTextNode(String(counter));
  observer.observe(textNode, {
    characterData: true,
  });
  timerFunc = () => {
    counter = (counter + 1) % 2;
    textNode.data = String(counter);
  };
  isUsingMicroTask = true;
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  timerFunc = () => {
    setImmediate(flushCallbacks);
  };
} else {
  timerFunc = () => {
    setTimeout(flushCallbacks, 0);
  };
}

export function nextTick(cb?: Function, ctx?: Object) {
  let _resolve;
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx);
      } catch (e) {
        handleError(e, ctx, 'nextTick');
      }
    } else if (_resolve) {
      _resolve(ctx);
    }
  });
  if (!pending) {
    pending = true;
    timerFunc();
  }
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise((resolve) => {
      _resolve = resolve;
    });
  }
}
```

首先定义了`callbacks`变量来维护待执行的函数，以及一个`flushCallbacks`方法来循环执行`callbacks`里面的方法，这个方法会拷贝`callbacks`变量，防止`callbacks`在执行过程中的再次被添加入回调函数。

接着定义了`timerFunc`这是异步方法的具体实现。

- 如果当前环境支持`Promise`的话，则将异步执行函数`flushCallbacks`放入微任务队列中用，`Promise.resolve().then()`来实现。并将`isUsingMicroTask`设置为`true`
- 接着判断当前浏览器是否支持`MutationObserver`，如果支持则将异步执行函数作为`MutationObserver`回调，并创建一个`textNode`，通过修改`textNode.data`来实现异步函数，同时将`isUsingMicroTask`设置为`true`
- 接着判断当前环境是否支持`setImmediate`，支持则使用`setImmediate`来实现一个宏任务队列
- 最后使用`setTimeout`来作为一个兜底的异步实现
  这样就完成了对一步函数`timerFunc`初始化

接着我们看具体的`nextTick`的实现。首先定义了一个`_resolve`方法，接着向`callbacks`push 了一个方法，方法很简单，如果有回调函数则执行回调函数，没有回调函数则执行`_resolve`方法。接着判断当前异步方法是否在执行中，如果没有执行则执行异步方法`timerFunc`，因为我们`callbacks`方法的执行是在`timerFunc`异步方法的回调里，所以当一轮同步任务执行完时，`callbacks`里面已经收集了这轮同步任务产生的所有通过`nextTick`添加进来的异步任务，包括 DOM 更新的`Watchr`函数。在同步任务结束后，在依次执行`callbacks`里面的回调函数。因为是依次执行的，如果我们在修改数据前就去获取 DOM 元素是获取不到的，比如：

```js
this.$nextTick(() => {
  //获取 a 属性对应的DOM是获取不到的
});
this.a = 'b';
```

最后，判断当前环境是否支持`Promise`并且`cb`参数为假值，是的话则返回一个`Promise`实例，并将内部的`resolve`函数赋值给`_resolve`变量。这样当我们调用`$nextTick`并且没有传递回调函数是就可以使用`Promise`的语法了

## 微任务与事件冒泡

上面的代码有一个全局变量`isUsingMicroTask`标记了当前`nextTick`的实现方式是一个微任务还是宏任务，这个变量的作用是什么呢？我们先来看下这样一个例子

```js
new Vue({
    template:`<div @click="flag?onDivClick:()=>{}">
        <button @click="flag = true">Button</button>
    </div>`
    data:{
        flag:false
    },
    methods:{
        onDivClick(){
            console.error(666)
        }
    }
})
```

当我们点击 button 的时候，`onDivClick`方法会执行吗？按我们的预期应该是不会执行的，因为 DOM 的更新在微任务队列里，是异步的。然而事实却是`onDivClick`会执行。因为微任务的执行太快了，比事件的冒泡还要快。所以当事件传递到外层 div 的时候，外层 div 的事件绑定已经更新过了。有什么办法能够规避这个问题呢，其实很简单，只需要比较事件执行的时间与事件挂载的事件，如果发生时间比挂载时间还要早，则不执行这个方法。

事件的挂载时间的定义，在`Watcher`调度器的`src/core/observer/scheduler.js`下

执行事件与挂载时间的对比相关代码，在 Web 平台的事件绑定相关的代码中`src/platforms/web/runtime/modules/events.js`

```js
function add(name, handler) {
  if (useMicrotaskFix) { //是否是微任务环境下
    const attachedTimestamp = currentFlushTimestamp;
    const original = handler;
    handler = original._wrapper = function (e) {
      if (e.timeStamp >= attachedTimestamp) { // 比较2者时间大小
        return original.apply(this, arguments);
      }
    };
  }

  target.addEventListener(
    name,
    handler
  );
}
```
以上是核心的判断代码，在微任务环境下去比较时间的发生时间与挂载时间。而宏任务的优先级比较微任务的低，所以不会出现这样的情况

## 总结
- nextTick 内部根据执行环境先后尝试使用`Promise` `MutationObserver` `setImmediate`和`setTimeout` 来实现一个异步调度函数
- 将一次同步任务产生的所有通过`nextTick`函数添加的回调放在一个队列里，在异步回调中一次性依次执行完毕
- 当`nextTick`执行环境是微任务时，防止因微任务优先级大于时间冒泡，导致的事件回调提前执行的问题。需要判断DOM回调执行时比较下事件的发生时间与挂载时间
