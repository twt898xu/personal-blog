module.exports = {
    title:'Blog',
    port:8888,
    base:'/personal-blog/',

    head:[
        ['link',{ rel:'icon',href:'/favicon.ico' }]
    ],
    themeConfig:{
        nav: [
            { text: 'Vue - Explorer', target:'_blank', link: 'https://twt898xu.github.io/vue-template-explorer/' },
        ],
        sidebar:[
            {   
                path:'/vue/',
                title:'Vue2学习记录(v2.6.14)',
                sidebarDepth:2,
                children:[ 
                    '/vue/vif',
                    '/vue/vpre&vonce',
                    '/vue/event',
                    '/vue/nextTick',
                    '/vue/vmodel',
                    '/vue/slot',
                ]
            },
            {
                path:'/vue-router/',
                title:'VueRouter学习记录(v3.6.5)',
                sidebarDepth:2,
                children:[
                    '/vue-router/install',
                    '/vue-router/router'
                ]
            },
            {
                path:'/other/',
                title:'其他',
                sidebarDepth:3,
                children:[
                    {
                        path:'/other/post-compiler/',
                        title:'按需加载与后编译分析',
                        sidebarDepth:2,
                        children:[
                            '/other/post-compiler/transform-module',
                            '/other/post-compiler/post-compiler'
                        ]
                    }
                ]
            }
        ]
    }
}
