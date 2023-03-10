# 其他

## init 方法

前面提过`vue-router`在`install`过程中会全局混入`beforeCreate`钩子，

```js
function beforeCreate() {
  if (isDef(this.$options.router)) {
    this._routerRoot = this;
    this._router = this.$options.router;
    this._router.init(this);
    Vue.util.defineReactive(this, '_route', this._router.history.current);
  } else {
    this._routerRoot = (this.$parent && this.$parent._routerRoot) || this;
  }
  registerInstance(this, this);
}
```

如果当前组件是根组件则会执行`this._router.init(this)`这段代码，对应到`hash`模式下，相关代码如下：

```js

```
