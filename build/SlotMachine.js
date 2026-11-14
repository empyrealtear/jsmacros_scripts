// 脚本名称: 老虎机抽奖
// 适配版本：forge 1.20.1
// 功能介绍: 老虎机界面挂机抽奖
// 依赖模组: jsmacros、老虎机（Slot Machine)
// 更新内容: v1.0 初始化脚本
// 更新内容: v1.1 添加自动填充金币功能（可搭配背包补货升级使用）
// 更新内容: v1.2 附近老虎机批量抽奖

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
    $id: 'slotmachinemod:server_slot_machine',
    $coin: 'createdeco:gold_coin',
    $PacketHandler: Java.type('net.micaxs.slotmachine.network.PacketHandler'),
    $ServerSlotsC2SPacket: Java.type('net.micaxs.slotmachine.network.packet.ServerSlotsC2SPacket'),
    $ServerClaimPayoutC2SPacket: Java.type('net.micaxs.slotmachine.network.packet.ServerClaimPayoutC2SPacket'),
    $ServerSlotMachineMenu: Java.type('net.micaxs.slotmachine.screen.ServerSlotMachineMenu'),
    getGuiBlockPos() { return this.$ServerSlotMachineMenu.blockEntity.m_58899_() },
    send(value, pos) {
        this.$PacketHandler.sendToServer(new this.$ServerSlotsC2SPacket(pos ?? this.getGuiBlockPos(), value))
    },
    claim(pos) {
        this.$PacketHandler.sendToServer(new this.$ServerClaimPayoutC2SPacket(pos ?? this.getGuiBlockPos()))
    }
}

if (isEnabled()) {
    let listenters = []
    listenters.push(JsMacros.on('OpenScreen', JavaWrapper.methodToJava((e, ctx) => {
        let screen = Hud.getOpenScreen()
        if (!screen) return
        if (Reflection.getClassName(screen) == SlotMachine.screenType) {
            let inv = Player.openInventory()
            if (inv) {
                // 补金币，保留1个金币用于占位
                if (inv.getSlot(36).getCount() == 0)
                    for (let i of inv.findItem(SlotMachine.$coin)) {
                        inv.click(i, 0)
                        Client.waitTick()
                        inv.click(i, 1)
                        Client.waitTick()
                        inv.click(36, 0)
                        break
                    }
                inv.close()
            }
        }
    })))

    let scanner = World.getWorldScanner().withStringBlockFilter().contains(SlotMachine.$id).build()
    let spinState = false
    _listener.on(() => {
        if (spinState) return
        /** @type {Pos3D[]} */
        let blocks = Array.from(scanner.scanAroundPlayer(3))
        if (blocks.length > 0)
            spinState = true
        let ply = Player.getPlayer().getBlockPos()
        for (let pos of blocks) {
            let block = World.getBlock(pos)
            let bpos = block.getBlockPos()
            let items = block.getNBT().resolve('inventory.Items').get(0).asListHelper()
            let hasCoin = false, hasReward = false
            for (let i = 0; i < items?.length(); i++) {
                let slot = items.get(i).resolve('Slot').get(0).asNumberHelper().asNumber()
                if (slot == 0)
                    hasCoin = true
                else
                    hasReward = true
            }
            if (hasCoin) {
                // 抽奖
                SlotMachine.send(true, bpos.getRaw())
                Client.waitTick()
                SlotMachine.send(false, bpos.getRaw())
            }
            if (hasReward) {
                // 领奖
                SlotMachine.claim(bpos.getRaw())
                Client.waitTick()
            }
            if (bpos.distanceTo(ply) <= Player.getReach()) {
                // 给可触及的老虎机补金币
                let inv = Player.openInventory()
                if (inv.contains(SlotMachine.$coin) && !hasCoin) {
                    inv?.close() // 关闭当前打开界面以免冲突
                    Player.getInteractionManager().interactBlock(pos.x, pos.y, pos.z, 'up', false)
                    Client.waitTick(5)
                }
            }
        }
        Client.waitTick(11)
        spinState = false
    }).offHandle = () => {
        listenters.forEach(v => JsMacros.off(v))
        listenters = []
    }
}
