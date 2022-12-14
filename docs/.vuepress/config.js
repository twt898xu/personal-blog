module.exports = {
    title:'Blog',
    port:8888,
    base:'/personal-blog/',

    themeConfig:{
        // nav: [
        //     { text: 'Vue2 - Explorer', link: '/vue2-explorer/index.html' },
        // ],
        sidebar:[
            {   
                path:'/vue/',
                title:'Vue学习记录',
                sidebarDepth:2,
                children:[ 
                    '/vue/vif',
                    '/vue/vpre&vonce',
                    '/vue/nextTick',
                ]

            }
        ]
    }
}