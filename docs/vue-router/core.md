# 路由跳转实现

这是路由的核心部分，这里用一个例子来说明，如有以下一个`router`对象

```js
const router = new VueRouter({
    mode:'hash',
    routers:[
        {
            path:'/main',
            component: MainComponent,
            children:[
                {
                    path:'a',
                    name:'a-component'
                    component: AComponent
                },
                {
                    path:'b',
                    name:'b-component',
                    component: BComponent
                },
            ]
        }
    ]
})
// 对应的路由匹配对象大致如下
// pathList: ['/main/a','/main/b','/main]
// pathMap:  {
//     '/main/a':{
//         path: '/main/a',
//         regex: /^\/main\/a(?:\/(?=$))?$/i,
//         name:'a-component',
//         components:[AComponent],
//     },
//     '/main/b':{
//         path: '/main/b',
//         regex: /^\/main\/b(?:\/(?=$))?$/i,
//         name:'b-component',
//         components:[BComponent],
//     },  
//     '/main':{
//         path: '/main',
//         regex: /^\/main(?:\/(?=$))?$/i,
//         components:[MainComponent],
//     },
// }
// nameMap: {
//           'a-component':{
//               path: '/main/a',
//               regex: /^\/main\/a(?:\/(?=$))?$/i,
//               name:'a-component',
//               components:[AComponent],
//           },
//           'b-component':{
//               path: '/main/b',
//               regex: /^\/main\/b(?:\/(?=$))?$/i,
//               name:'b-component',
//               components:[BComponent],
//          },
//
```
