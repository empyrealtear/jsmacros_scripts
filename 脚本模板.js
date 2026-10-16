// 脚本名称: 脚本模板
// 功能介绍: 兼容按键和服务触发，监听session兼容瞬开瞬关
// 依赖模组: jsmacros
// 更新内容: v1.0 初始化脚本

const scriptName = file.getName().replace(/\.(js|ts)$/, '')
const _session = `${scriptName}:session`
const _enabled = `${scriptName}:enabled`
const session = GlobalVars.incrementAndGetInt(_session)
const _listener = {
    tick: null, counter: 0, step: 3,
    on(handle) {
        this.tick = JsMacros.on('Tick', JavaWrapper.methodToJava(() => {
            if (!isEnabled()) return this.off()
            if (++this.counter % this.step != 0) return
            handle?.()
        }))
    },
    off() { this.tick && JsMacros.off(this.tick), this.tick = null }
}
const mclog = (msg, color = 7) => Chat.log(`§7[§5${scriptName}§7] §${(color % 16).toString(16)}${msg}`)
const isEnabled = () => GlobalVars.getBoolean(_enabled) && GlobalVars.getInt(_session) == session
const toggleEnabled = (v) => mclog(GlobalVars.putBoolean(_enabled, v ?? !isEnabled()) ? "启用" : "关闭")

try {
    JsMacros.assertEvent(event, 'Service')
    event.stopListener = JavaWrapper.methodToJava(() => { _listener.off(); toggleEnabled(false) })
    toggleEnabled(true)
} catch { toggleEnabled() }

if (isEnabled()) {
    _listener.on(() => {
        // 循环代码
    })
}
