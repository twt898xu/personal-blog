# 组件的挂载

用一个例子了解下组件在挂载过程中的逻辑
```js
new Vue({
    el:'app',
    components:{
        App:{
            render(h){
                return h('div','app')
            }
        }
    },
    render(h){
        return h('App')
    }
})
```

## 实例化

首先实例化了`Vue`对象，该函数定义在`src/core/instance/index.js`文件中
```js
function Vue (options) {
  //new Vue的时候执行 _init 方法，此方法在 initMixin 中挂载
  this._init(options)
}

//给Vue混入一系列方法，主要是给prototype添加方法
initMixin(Vue)  //混入 _init
stateMixin(Vue) //混入 $data $prop $set $delete $watch
eventsMixin(Vue)//混入 $on $off $emit $once
lifecycleMixin(Vue) //混入 _update $forceUpdate $destroy
renderMixin(Vue)//混入 $nextTick _render 和一系列的render方法：_v _e 等
```

重点看一下`_init`这个方法的实现
```js
Vue.prototype._init = function(options){
    const vm = this // vm  vue的实例

    vm._uid = uid++ // 实例的id

    vm._isVue = true  // 添加vue实例标记 防止被观察

    if (options && options._isComponent){
        initInternalComponent(vm, options)
    }else{
        // 处理话实例的 $options
        vm.$options = mergeOptions(
            resolveConstructorOptions(vm.constructor), //获取构造函数的options
            options || {}, //当前实例的options
            vm
        )
    }

    vm._renderProxy = vm // _renderProxy 是调用render函数时候用到的
    vm._self = vm

    initLifecycle(vm) // 初始化一些生命周期上的变量 和 与父组件建立关系
    initEvents(vm) // 初始化组件的事件监听
    initRender(vm)  // 初始化 _render
    callHook(vm, 'beforeCreate')
    initInjections(vm) // resolve injections before data/props
    initState(vm)
    initProvide(vm) // resolve provide after data/props
    callHook(vm, 'created')

    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
}
```

可以看到`_init`方法主要就是完成`vue`实例的生成，初始化了实例的一些列属性。最后判断当前实例有无`el`属性，有则自动执行挂载方法。挂载方法与运行的平台有关，web上对应在`src/platforms/web/runtime/index.js`文件中
```js
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && inBrowser ? query(el) : undefined
  return mountComponent(this, el, hydrating) //调用 mountComponent 方法
}
```
看的出来其实是调用了`mountComponent`方法,参数是当前的实例和`el`dom对象
```js
function mountComponent(vm,el){

    vm.$el = el // $el 为传入的dom
    callHook(vm, 'beforeMount')
    let updateComponent
    // updateComponent 方法
    updateComponent = () => {
      vm._update(vm._render(), hydrating)
    }
    // watcher 会在初始化的时候执行 updateComponent 方法，在执行过程中实现依赖的收集
    // 当依赖的数据发生变化时会自动执行 updateComponent 完成重新渲染
    new Watcher(vm, updateComponent, noop, {
        // before 是 updateComponent 执行前调用的方法
        before () {
            if (vm._isMounted && !vm._isDestroyed) {
                callHook(vm, 'beforeUpdate')
            }
        }
    }, true /* isRenderWatcher */)

    // $vnode 表示的是父组件的vnode，为空则表示当前实例是根实例 $vnode 在_render方法中挂载
    // 子组件的mounted不在这里执行 子组件在vnode的insert的钩子函数中触发
    if (vm.$vnode == null) {
        vm._isMounted = true
        callHook(vm, 'mounted')
    }
    return vm
}
```

可以看到，`mountComponent`核心就是初始化了一个`render watcher`，会在初始化和数据变化时调用`updateComponent`方法。先看`_render`方法，定义在`src/core/instance/render.js`方法中
```js
Vue.prototype._render = function (){
    const vm = this

    const { render, _parentVnode } = vm.$options
    // 从父组件vnode中拿到 ScopedSlots 配置
    if (_parentVnode) {
      vm.$scopedSlots = normalizeScopedSlots(
        _parentVnode.data.scopedSlots,
        vm.$slots,
        vm.$scopedSlots
      )
    }
    vm.$vnode = _parentVnode // 父组件的vnode

    let node
    try{
        // 父子组件递归实例时用
        currentRenderingInstance = vm
        // 核心就是调用 $createElement 方法  就是我们的 h 函数
        vnode = render.call(vm._renderProxy, vm.$createElement) // vm._renderProxy === vm 

    } finally {
       currentRenderingInstance = null
    }

    if (Array.isArray(vnode) && vnode.length === 1) {
       vnode = vnode[0]
    }

    vnode.parent = _parentVnode
    return vnode
}
```
`_render`的核心就是调用`$createElement`方法，这个方法核心是`_createElement`方法在`src/core/vdom/create-element.js`内
```js
function _createElement(context,tag,data,child){

    if (isDef(data) && isDef(data.is)) {
        tag = data.is // 组件的is属性
    }

    // 不明白为啥这样写
    if (Array.isArray(children) &&
        typeof children[0] === 'function'
    ) {
        data = data || {}
        data.scopedSlots = { default: children[0] }
        children.length = 0
    }

    // 规范化child
    if (normalizationType === ALWAYS_NORMALIZE) {
        // 调用场景：1：用户手写的render
        // 2: 编译slot v-for的时候 产生嵌套数组的情况
        children = normalizeChildren(children)
    } else if (normalizationType === SIMPLE_NORMALIZE) {
        // 调用场景 1:render是编译生成的
        children = simpleNormalizeChildren(children)
    }

    let node
    if(typeof tag === 'string'){
        let Ctor
        if (config.isReservedTag(tag)){
            // 普通的html元素
            vnode = new VNode(config.parsePlatformTagName(tag), data, children,undefined, undefined, context)
        }else if((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))){
            vnode = createComponent(Ctor, data, context, children, tag) //组件
        }else{
            // 未知  直接生成
            vnode = new VNode(tag, data, children,undefined, undefined, context)
        }
    }else {
        // 组件
        vnode = createComponent(tag, data, context, children)
    }

    return node
}
```
以我们的例子，这里的`tag`应该是`App`应该会走到`resolveAsset`这个分支，这个方法在此场景下会去获取`context.$options.components.App`。而$options是在`_init`中初始化的，这里其实就是`components`中的配置
```js
Ctor = {
    render(h){
        return h('div','app')
    }
}
```
接着看下`createComponent`方法
```js
function createComponent(Ctor,data,context,children,tag){

    const baseCtor = context.$options._base // _base就是Vue函数 在global-api中定义
    // 根据我们配置的options 生成组件的构造函数
    // 所有该组件实例 都是当前函数的实例
    if (isObject(Ctor)) {
        Ctor = baseCtor.extend(Ctor)
    }

    // 异步组件
    let asyncFactory
    // cid 在 extend 方法中添加
    if (isUndef(Ctor.cid)) {
        asyncFactory = Ctor
        Ctor = resolveAsyncComponent(asyncFactory, baseCtor)
        if (Ctor === undefined) {
        // return a placeholder node for async component, which is rendered
        // as a comment node but preserves all the raw information for the node.
        // the information will be used for async server-rendering and hydration.
        return createAsyncPlaceholder(
            asyncFactory,
            data,
            context,
            children,
            tag
        )
        }
    }

    resolveConstructorOptions(Ctor)

    // 处理组件的 v-model 绑定
    if (isDef(data.model)) {
        transformModel(Ctor.options, data)
    }

    // 提取props
    // 根据vnode传入props attrs 和 构造函数配置的 propsOptions
    // 提取出 props 配置
    const propsData = extractPropsFromVNodeData(data, Ctor, tag)

    if (isTrue(Ctor.options.functional)) {
        return createFunctionalComponent(Ctor, propsData, data, context, children)
    }

    const listeners = data.on // 组件事件赋值到 listeners 上
    data.on = data.nativeOn  // 原生事件绑定到on上

    // 抽象组件 data除了slot其他都不要
    if (isTrue(Ctor.options.abstract)) {
        const slot = data.slot
        data = {}
        if (slot) {
            data.slot = slot
        }
    }

    // 安装组件的 vnode hooks
    installComponentHooks(data)
    const name = Ctor.options.name || tag
    // 组件没有children children作为 componentOptions 传入
    const vnode = new VNode(
        `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
        data, undefined, undefined, undefined, context,
        { Ctor, propsData, listeners, tag, children },
        asyncFactory
    )

    return vnode
}
```
这里大致做了这么几件事 1、生成构造函数 2、处理构造函数的options 3、安装组件钩子。看下这几个方法具体都做了哪些事情

`extend`定义在`src/core/global-api/extend.js`文件中
```js
Vue.extend = function(extendOptions){
    // 这里首先判断了基类函数 Super 就是 Vue 函数
    const Super = this
    const SuperId = Super.cid
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    // 判断构造函数的缓存 如有缓存就从缓存里面拿
    // 所以每个组件options 理论只会生成一次构造函数
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    const name = extendOptions.name || Super.options.name
    // 生成 Sub 派生函数
    const Sub = function VueComponent (options) {
      this._init(options)
    }

    // 原型链继承
    Sub.prototype = Object.create(Super.prototype)
    Sub.prototype.constructor = Sub
    Sub.cid = cid++
    Sub.options = mergeOptions( // 生成派生函数的options
      Super.options,
      extendOptions
    )
    Sub['super'] = Super // 指向基类函数

    // 静态的属性直接绑定到原型上面去 减少了实例化时的开销
    if (Sub.options.props) {
      initProps(Sub)
    }
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // 静态函数的继承
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // 静态属性的继承 components filters directs
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })

    // 自己注册自己 实现递归调用
    if (name) {
      Sub.options.components[name] = Sub
    }

    // options 的绑定
    Sub.superOptions = Super.options // 基类 options
    Sub.extendOptions = extendOptions // 原始的 组件配置 options
    Sub.sealedOptions = extend({}, Sub.options) // Sub.options 原始值

    // 加入缓存
    cachedCtors[SuperId] = Sub
    return Sub
}
```
可见，`extend`主要实现就是一个对象的原型链继承，返回了一个派生于`Vue`的构造函数
接着看下`resolveConstructorOptions`的实现
```js
export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  if (Ctor.super) {
    // 获取基类函数的options
    const superOptions = resolveConstructorOptions(Ctor.super)
    // 执行继承时 保留的基类 配置
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      Ctor.superOptions = superOptions // 重新赋值
      const modifiedOptions = resolveModifiedOptions(Ctor) // 获取当前函数的 sealedOptions 与 options 的diff
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)  // 重新生成options
      if (options.name) {
        options.components[options.name] = Ctor // 将自身添加到自身的 components中去
      }
    }
  }
  return options
}
```
这个方法主要是对基类的`options`发生变化时做些处理，包装组件构造函数上的`options`能正常的继承到基类的配置。
最后看下`installComponentHooks`的实现
```js
function installComponentHooks (data: VNodeData) {
  const hooks = data.hook || (data.hook = {})
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i]
    const existing = hooks[key]
    const toMerge = componentVNodeHooks[key]
    if (existing !== toMerge && !(existing && existing._merged)) {
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}

function mergeHook (f1: any, f2: any): Function {
  const merged = (a, b) => {
    f1(a, b)
    f2(a, b)
  }
  merged._merged = true
  return merged
}
```
代码很简单就是循环的调用`mergeHook`方法，将配置好的钩子函数添加到`vnode.hook`中去。vnode一共有4个钩子函数`init` `prepatch` `insert` `destory`这里不多介绍。到这里组件的`vnode`就生成完成了,`_render`方法就执行完成了。`vm._update(vm._render(), hydrating)`接着该执行`_update`方法了。这个方法定义在`src/core/instance/lifecycle.js`文件内
```js
Vue.prototype._update = function(vnode){
    const vm = this
    const prevEl = vm.$el // 
    const prevVnode = vm._vnode // 当前实例的vnode 初次挂载为空
    const restoreActiveInstance = setActiveInstance(vm) // 因为挂载时深度优先的算法 ，需要保存当挂载中的 实例
    vm._vnode = vnode // 给实例添加 _vnode
    // 首次渲染
    if(!prevVnode){
        vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false)
    }else {
        // 更新
        vm.$el = vm.__patch__(prevVnode, vnode)
    }
    restoreActiveInstance() // 恢复挂载中的实例
    if (prevEl) { // 解除 $el 对实例的引用 
      prevEl.__vue__ = null
    }
    if (vm.$el) { // 添加 $el 对实例的引用
      vm.$el.__vue__ = vm
    }
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
}
```
可以看到核心就是调用 `__patch__` 方法进行了挂载，这个方法定义在平台的入口文件中中核心实现是`src/platforms/web/runtime/patch.js`文件中
```js
//根据平台类型不同创建不同的patch方法，函数的柯里化
export const patch: Function = createPatchFunction({ nodeOps, modules })
```
`nodeOps`是一些`dom`方法的封装，而`modules`则是一些`vnode`的钩子方法的封装。直接看`createPatchFunction`方法，这个方法内容较多，我们直接看它返回的`pacth`方法
```js
function patch (oldVnode, vnode, hydrating, removeOnly) {
    if (isUndef(vnode)) {
      // 销毁组件
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode) // 执行 vnode destroy 
      return
    }

    let isInitialPatch = false
    const insertedVnodeQueue = []
    if (isUndef(oldVnode)) {
      // 空挂载 组件第一次初始化
      isInitialPatch = true
      createElm(vnode, insertedVnodeQueue)
    } else {
        // 执行 vnode diff
    }

    //执行 insert 的钩子
    // 钩子里面触发 mounted 钩子
    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)
    return vnode.elm
}
```
我们逻辑会到`createElm`方法里去
```js
function createElm (
    vnode,
    insertedVnodeQueue,
    parentElm,
    refElm,
    nested,
    ownerArray,
    index
  ) {

    // 组件类型的 vnode 会直接到 createComponent 方法内
    if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
      return
    }

    // ...
}
```
因为我们例子中`App`是一个组件，所以会进入到组件的挂载逻辑，我们先看`createComponent`方法
```js
function createComponent (vnode, insertedVnodeQueue, parentElm, refElm){
    let i = vnode.data
    if (isDef(i)) {
      const isReactivated = isDef(vnode.componentInstance) && i.keepAlive
      if (isDef(i = i.hook) && isDef(i = i.init)) {
        i(vnode, false /* hydrating */) // 执行 vnode 的init 钩子
      }
      if (isDef(vnode.componentInstance)) {
        initComponent(vnode, insertedVnodeQueue)
        insert(parentElm, vnode.elm, refElm)
        if (isTrue(isReactivated)) {
          reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm)
        }
        return true
      }
    }
}
```
这里逻辑又跑到`vnode`的`init`钩子里面去了，代码在`src/core/vdom/create-component.js`里面
```js
function init (vnode: VNodeWithData, hydrating: boolean): ?boolean {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else {
        // 核心逻辑在这
        // 执行了 createComponentInstanceForVnode 方法
        // 这里的 activeInstance 就是当前的实例 
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      )
      // 调用 $mount 进行挂载
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    }
}

function createComponentInstanceForVnode(vnode,parent){
    const options: InternalComponentOptions = {
        _isComponent: true, // 标记是一个组件
        _parentVnode: vnode,
        parent
    }
    // 关键的来了 在这个地方调用了 该组件的构造函数
    // 这里的 options 与我们手写的 new 调用有很大区别。
    return new vnode.componentOptions.Ctor(options)
}
```
可以看到这里实例化了一个子组件，又回到了开始初始化的地方vue实例的`_init`方法，回到那个方法
```js
function _init(){
    // ...
    // 因为是组件所以进入到了 initInternalComponent 逻辑
    if (options && options._isComponent){
        initInternalComponent(vm, options)
    }
    // ...
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  const opts = vm.$options = Object.create(vm.constructor.options) // 从构造函数上拿到options配置
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners // listeners 就是写在组件上 组件事件
  opts._renderChildren = vnodeComponentOptions.children // 
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}
```
组件`_init`方法执行完成，就回到了`vnode`的`init`钩子里面去了，钩子函数最后执行了`$mount`挂载函数。前面已经说过这个函数了，直接进入到`render`执行时的普通元素的分支，不会再执行`createComponent`方法，执行完成后进入到挂载阶段。挂载阶段的`createComponent`方法返回空，直接进入后续逻辑
```js
function createElm (
    vnode,
    insertedVnodeQueue,
    parentElm,
    refElm,
    nested,
    ownerArray,
    index
  ){
    // 省略组件的挂载方法

    const data = vnode.data
    const children = vnode.children
    const tag = vnode.tag

    // 例子中有tag 会进入到标签元素的创建中来
    if (isDef(tag)) {
        // 这里会执行 createElement 我们的例子中来说就是创建一个div
        vnode.elm = vnode.ns
        ? nodeOps.createElementNS(vnode.ns, tag)
        : nodeOps.createElement(tag, vnode)
        // style scoped 的设置
        setScope(vnode)
        // 子元素的创建 循环递归调用 createElm
        createChildren(vnode, children, insertedVnodeQueue)
        if (isDef(data)) {
            // 调用vnode create 钩子
           invokeCreateHooks(vnode, insertedVnodeQueue)
        }

        // insert 就是做dom的插入
        // 因为 createChildren 在 insert前调用 所以是先插入子元素 最后插入父元素
        insert(parentElm, vnode.elm, refElm)
    }
  }
```
至此我们的`App`组件就渲染完成了，接着逻辑就回到了我们的顶级应用里，代码的`createComponent`方法
```js
function createComponent (vnode, insertedVnodeQueue, parentElm, refElm){
    let i = vnode.data
    if (isDef(i)) {
      const isReactivated = isDef(vnode.componentInstance) && i.keepAlive
      if (isDef(i = i.hook) && isDef(i = i.init)) {
        i(vnode, false /* hydrating */) 
      }
        // init 钩子执行完成，表示子组件已经渲染完成了 vnode.componentInstance 就是组件的实例
      if (isDef(vnode.componentInstance)) {
        initComponent(vnode, insertedVnodeQueue) // 
        insert(parentElm, vnode.elm, refElm) // 插入
        if (isTrue(isReactivated)) {
          reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm)
        }
        return true
      }
    }
}
```
至此所有的挂载逻辑就走完了

## 总结
简答总结一个整个逻辑
- 首先 `new Vue`的时候执行Vue函数，这个过程会执行原型上的`_init`方法，主要绑定和处理实例上的一些属性，如`$options` 事件监听 数据的响应式处理，`beforeCreate` `created`的钩子调用等。最后判断有无`el`属性，如有则调用`$mount`方法进行挂载
- `$mount`的核心是生成`render watcher`，这个`watcher`会在初始化时和依赖数据发生变化时执行`updateComponent`方法。`updateComponent`的核心是调用当前实例`_render`函数和`_update`函数，分别进行`vnode`的生成了`vnode`的挂载
- `_render`的本质是调用我们自己写的或编译的`render`函数，这个函数内部会根据`render`函数的第一个参数来判断节点是否是一个普通元素标签。如果是普通元素标签就直接生成`vnode`。如果判断是一个组件，则会调用`createComponent`生成组件的`vnode`
- `createComponent`接收我们定义在当前实例上的`components`里面的对象作为参数。如果这个参数不是一个函数，它会调用`extend`方法，生成一个`Vue`的子类，作为当前组件的构造函数。接着会给传入的`data`参数添加上组件`vnode`的钩子函数。最后生成组件的`vnode`并返回。`render`函数就算是执行完毕了。
- `render`执行完成返回的`vnode`会作为参数被`_update`函数所调用。这个函数的核心是根据`vnode`生成真实的`dom`并插入到文档中。首先它判断了当前`vnode`是不是一个`component`。如果是组件类型的`vnode`就会调用`vnode.data.hook.init`方法，就是`vnode`的`init`钩子
- 组件的`init`钩子做了2件事，1是用当前组件的构造函数实例化了一个对象，参数里面会添加`_isComponent`参数。2是调用组件实例的`$mount`方法。这样相当于是又执行了一遍实例化的过程。所以可得知，子组件的实例化是在父组件挂载的过程中触发的，而且`$mount`是自动调用的。
- 子组件又经过初始化 `render`，又到了`patch`的过程。这时候因为当前的`vnode`不再是一个组件类型，会进入到普通元素的挂载过程中去。 首先会根据`vnode`的`tag`创建一个`html`标签，接着调用`createChildren`递归处理子元素。然后调用`invokeCreateHooks`处理`vnode`的`create`钩子。最后调用`insert`将生成的`dom`插入到父元素上。
- 这时候子组件就算是处理完成了，代码逻辑有回到了上级逻辑，即组件`vnode`的`init`钩子执行完毕。接着又将渲染完成的组件实例的元素插入到父级中，完成组件的插入，这里会执行`insert`钩子，触发组件的`mounted`生命周期钩子。父级的`patch`也就结束了，整个首次渲染就结束了 