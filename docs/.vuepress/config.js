module.exports = {
    title:'Blog',
    port:8888,
   
    themeConfig:{
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