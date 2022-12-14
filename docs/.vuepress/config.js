module.exports = {
    title:'Blog',
    port:8888,
    base:'/personal-blog/',

    themeConfig:{
        nav: [
            { text: 'Vue - Explorer', target:'_blank', link: 'https://twt898xu.github.io/vue-template-explorer/' },
        ],
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
