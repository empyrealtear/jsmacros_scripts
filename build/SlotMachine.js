// 脚本名称: 老虎机抽奖
// 适配版本：forge 1.20.1
// 功能介绍: 老虎机界面挂机抽奖
// 依赖模组: jsmacros、老虎机（Slot Machine)
// 更新内容: v1.0 初始化脚本
// 更新内容: v1.1 添加自动填充金币功能（可搭配背包补货升级使用）

const scriptName = file.getName().replace(/\.(js|ts)$/, '')
const _session = `${scriptName}:session`
const _enabled = `${scriptName}:enabled`
const session = GlobalVars.incrementAndGetInt(_session)
const _listener = {
    tick: null, counter: 0, step: 3, offHandle: null,
    on(handle) {
        this.tick = JsMacros.on('Tick', JavaWrapper.methodToJava(() => {
            if (!isEnabled()) return this.off()
            if (++this.counter % this.step != 0) return
            handle?.()
        }))
        return this
    },
    off() { this.offHandle?.(); this.tick && JsMacros.off(this.tick); this.tick = null; return this }
}
const mclog = (msg, color = 7) => Chat.log(`§7[§5${scriptName}§7] §${(color % 16).toString(16)}${msg}`)
const isEnabled = () => GlobalVars.getBoolean(_enabled) && GlobalVars.getInt(_session) == session
const toggleEnabled = (v) => mclog(GlobalVars.putBoolean(_enabled, v ?? !isEnabled()) ? "启用" : "关闭")

try {
    JsMacros.assertEvent(event, 'Service')
    event.stopListener = JavaWrapper.methodToJava(() => { _listener.off(); toggleEnabled(false) })
    toggleEnabled(true)
} catch { toggleEnabled() }

const SlotMachine = {
    screenType: 'net.micaxs.slotmachine.screen.ServerSlotMachineScreen',
    $PacketHandler: Java.type('net.micaxs.slotmachine.network.PacketHandler'),
    $ServerSlotsC2SPacket: Java.type('net.micaxs.slotmachine.network.packet.ServerSlotsC2SPacket'),
    $ServerSlotMachineMenu: Java.type('net.micaxs.slotmachine.screen.ServerSlotMachineMenu'),
    getBlockPos() { return this.$ServerSlotMachineMenu.blockEntity.m_58899_() },
    send(value) {
        this.$PacketHandler.sendToServer(
            new this.$ServerSlotsC2SPacket(
                this.getBlockPos(), value))
    }
}

if (isEnabled()) {
    let listenters = []
    listenters.push(JsMacros.on('OpenScreen', JavaWrapper.methodToJava((e, ctx) => {
        let screen = Hud.getOpenScreen()
        if (!screen) return

        if (Reflection.getClassName(screen) == SlotMachine.screenType) {
            Client.runOnMainThread(JavaWrapper.methodToJava(() => screen.getWidth()), true, 3000)
            const toNumber = (str) => { let n = parseInt(str); return Number.isFinite(n) ? n : null }
            let scale = Hud.getScaleFactor()
            let width = Hud.getWindowWidth() / scale, height = Hud.getWindowHeight() / scale
            while (isEnabled()) {
                screen = Hud.getOpenScreen()
                if (!(screen && Reflection.getClassName(screen) == SlotMachine.screenType)) break
                try {
                    let inv = Player.openInventory()
                    if (inv) {
                        if (inv.getSlot(36).getCount() == 0)
                            for (let i of inv.getSlots(['main', 'hotbar'])) {
                                if (inv.getSlot(i).getItemId() == 'createdeco:gold_coin') {
                                    inv.swap(i, 36)
                                    Client.waitTick(5)
                                    break
                                }
                            }
                        if (inv.getSlot(37).getCount() > 0) {
                            inv.dropSlot(37, true)
                            Client.waitTick(5)
                        }
                        if (inv.getSlot(36).getCount() > 0 && inv.getSlot(37).getCount() == 0) {
                            SlotMachine.send(true)
                            Client.waitTick()
                            SlotMachine.send(false)
                        }
                    }
                } catch (e) {
                    mclog(e)
                    break
                }
                Client.waitTick(11) // 最低间隔要求500ms，否则服务端会开始记录玩家及坐标
            }
        }
    })))

    _listener.on(() => {
        // 循环代码
    }).offHandle = () => {
        listenters.forEach(v => JsMacros.off(v))
        listenters = []
    }
}
