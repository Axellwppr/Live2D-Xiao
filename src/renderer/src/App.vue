<script setup lang="ts">
</script>

<template>
    <div style="position: absolute;width: 100%; top:0">
        <div style="display: flex; justify-content: center;">
            <v-icon v-if="show" color="grey" icon="mdi-cursor-move" size="36" @mouseenter="readyMove"
                @mouseleave="unreadyMove" class="mt-15"></v-icon>
        </div>
    </div>
    <div style="position: absolute;width: 100%; bottom:310px; z-index: -1;">
        <v-card class="mx-5 text-white text-center" color="black" style="max-width: 100%;opacity: 0.7"
            v-if="messageToShow != ''">
            <v-card-text>{{ messageToShow }}</v-card-text>
        </v-card>
    </div>
</template>

<script lang="ts">
// 获得当前选择的角色
let character = Number(window.character)
// console.log(character)
// 加载角色配置
let messageData, timeData, mouseData, keyboardData, applicationData, expressionData, enableWalking
let config = [
    {
        model: {
            source: './',
            models: {
                path: '/xiao/xiao.model3.json',
                scale: 0.8,
                x: 33,
                stageStyle: {
                    width: 250
                }
            },
            tips: false
        },
        name: 'xiao',
    }, {
        model: {
            source: './',
            models: {
                path: '/fengyuanwanye/fengyuanwanye.model3.json',
                scale: 2,
                x: 0,
                y: -130,
                stageStyle: {
                    width: 250
                }
            },
            tips: false
        },
        name: 'wanye'
    }
]

// 加载模型
import { loadOhMyLive2D } from '../plugins/live2d';
loadOhMyLive2D(config[character].model)
window.electron.ipcRenderer.on('mouse-move', (_sender, arg) => {
    (window.hijackedMouse == null) || window.hijackedMouse.onPointerMove(new MouseEvent('mousemove', {
        clientX: arg.x,
        clientY: arg.y
    }))
})

export default {
    data() {
        return {
            show: false,
            move: false,
            timeMessage: '',
            mouseMessage: '',
            lastMouseStatus: '',
            mouseTime: -1 as any,
            keyboardMessage: '',
            lastKeyboardStatus: '',
            keyboardTime: -1 as any,
            applicationMessage: '',
            lastApplicationStatus: '',
            applicationTime: -1 as any,
            expressionMessage: '',
            isWalking: false,
            walkTime: -1 as any,
            walkDirection: 2,
            walkSteps: 0,
        }
    },
    async mounted() {
        messageData = await import(`./message/${config[character].name}.json`)
        timeData = messageData.time
        mouseData = messageData.mouse
        keyboardData = messageData.keyboard
        applicationData = messageData.application
        expressionData = messageData.expression
        enableWalking = messageData.walking

        // 移动按钮显示
        window.electron.ipcRenderer.on('show-drag', () => {
            this.show = true
        })
        window.electron.ipcRenderer.on('hide-drag', () => {
            this.show = false
        })

        // 定时消息显示
        this.getTimeMessage();
        setInterval(this.getTimeMessage, 10 * 60 * 1000);

        // 鼠标消息显示
        window.electron.ipcRenderer.on('mouse-status', (_sender, arg) => {
            if (this.mouseTime != -1) {
                clearTimeout(this.mouseTime)
                this.mouseTime = -1
            }

            this.mouseTime = setTimeout(() => {
                this.lastMouseStatus = "stop"
                mouseData.forEach((item) => {
                    if (item.mouse_movement == "stop") {
                        this.mouseMessage = item.messages[Math.floor(Math.random() * item.messages.length)]
                    }
                })
                if (this.mouseTime != -1) {
                    clearTimeout(this.mouseTime)
                    this.mouseTime = -1
                }
                this.mouseTime = setTimeout(() => {
                    this.mouseMessage = ''
                }, 5000)
            }, 2500)

            if (arg == this.lastMouseStatus) return
            if (arg == 'hold') return
            this.lastMouseStatus = arg

            mouseData.forEach((item) => {
                if (item.mouse_movement == arg) {
                    this.mouseMessage = item.messages[Math.floor(Math.random() * item.messages.length)]
                }
            })
        })

        // 键盘消息显示
        window.electron.ipcRenderer.on('keyboard-status', (_sender, arg) => {
            if (this.keyboardTime != -1) {
                clearTimeout(this.keyboardTime)
                this.keyboardTime = -1
            }

            this.keyboardTime = setTimeout(() => {
                this.lastKeyboardStatus = "stop"
                keyboardData.forEach((item) => {
                    if (item.keyboard_input == "stop") {
                        this.keyboardMessage = item.messages[Math.floor(Math.random() * item.messages.length)]
                    }
                })
                if (this.keyboardTime != -1) {
                    clearTimeout(this.keyboardTime)
                    this.keyboardTime = -1
                }
                this.keyboardTime = setTimeout(() => {
                    this.keyboardMessage = ''
                }, 5000)
            }, 4500)

            if (arg == this.lastKeyboardStatus) return
            this.lastKeyboardStatus = arg

            keyboardData.forEach((item) => {
                if (item.keyboard_input == arg) {
                    this.keyboardMessage = item.messages[Math.floor(Math.random() * item.messages.length)]
                }
            })
        })

        // 应用消息显示
        window.electron.ipcRenderer.on('application-status', (_sender, arg) => {
            if (arg == this.lastApplicationStatus) return
            this.lastApplicationStatus = arg
            if (this.applicationTime != -1) {
                clearTimeout(this.applicationTime)
                this.applicationTime = -1
            }

            this.applicationTime = setTimeout(() => {
                this.applicationMessage = ''
            }, 10000)

            applicationData.forEach((item) => {
                if (arg.includes(item.window_text)) {
                    this.applicationMessage = item.message
                }
            })
        })

        // 定时姿态切换
        setInterval(() => {
            let length = expressionData.length
            let random = Math.floor(Math.random() * length)
            if (enableWalking) length--;

            if (random == length) {
                this.isWalking = true;
                this.startWalk();
            }
            else {
                this.isWalking = false;
                if (this.walkTime != -1) {
                    clearInterval(this.walkTime);
                    this.walkTime = -1;
                }
            }

            if (random == length - 1) window.hijackedMode.resetExpression();
            else if (random < length - 1) window.hijackedMode.expression(random);
            this.expressionMessage = expressionData[random].messages[Math.floor(Math.random() * expressionData[random].messages.length)]
            setTimeout(() => {
                this.expressionMessage = ''
            }, 8000)
        }, 145 * 1000)
    },
    methods: {
        readyMove() {
            // console.log('ready')
            window.electron.ipcRenderer.send('ready-move')
        },
        unreadyMove() {
            // console.log('unready')
            window.electron.ipcRenderer.send('unready-move')
        },
        getTimeMessage() {
            let nowTime = new Date()
            let nowHour = nowTime.getHours()

            timeData.forEach((item) => {
                if (nowHour >= item.time[0] && nowHour < item.time[1]) {
                    this.timeMessage = item.messages[Math.floor(Math.random() * item.messages.length)]
                }
            })
        },
        startWalk() {
            let index = 0
            if (this.walkTime != -1) {
                clearInterval(this.walkTime);
                this.walkTime = -1;
            }
            this.walkTime = setInterval(() => {
                if (index == 0) {
                    window.hijackedMode.expression(4);
                }
                else {
                    window.hijackedMode.expression(5);
                    setTimeout(() => {
                        this.walkWindow();
                    }, 300)
                }
                index = (index + 1) % 2;
            }, 500)
        },
        walkWindow() {
            window.electron.ipcRenderer.send('windowWalk', this.walkDirection);
            this.walkSteps++;
            if (this.walkSteps >= 10) {
                this.walkDirection = (this.walkDirection + 1) % 4;
                this.walkSteps = 0;
            }
        }
    },
    computed: {
        messageToShow: function () {
            if (this.expressionMessage != '') {
                return this.expressionMessage;
            }
            if (this.applicationMessage != '') {
                return this.applicationMessage;
            }
            if (this.mouseMessage != '' && this.lastMouseStatus != 'stop') {
                return this.mouseMessage;
            }
            if (this.keyboardMessage != '' && this.lastKeyboardStatus != 'stop') {
                return this.keyboardMessage;
            }
            if (this.mouseMessage != '') {
                return this.mouseMessage;
            }
            if (this.keyboardMessage != '') {
                return this.keyboardMessage;
            }
            if (this.timeMessage) {
                return this.timeMessage;
            }
            return '';
        }
    }
}
</script>

<style lang="less">
::-webkit-scrollbar {
    display: none;
}

* {
    user-select: none;
    -webkit-touch-callout: none;
}

.body {
    background-color: transparent;
}

#oml-levitated-btn {
    display: none;
}
</style>
