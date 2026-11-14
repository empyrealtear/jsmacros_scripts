// 脚本名称: 老虎机抽奖
// 功能介绍: 老虎机界面挂机抽奖（仅单人支持远程强加载区块绑定抽奖）
// 依赖模组: jsmacros、老虎机（Slot Machine)
// 更新内容: v1.0 初始化脚本
// 更新内容: v1.1 添加自动填充金币功能（可搭配背包补货升级使用）
// 更新内容: v1.2 附近老虎机批量抽奖
// 更新内容: v1.3 可在老虎机界面配置绑定机器、抽奖模式等参数

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
const _dev = false

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

// ============ 持久化存储：绑定坐标 + 运行状态 ============
// 数据结构:
// {
//   "binds": { "<维度>": { "x,y,z": 时间戳 } },
//   "state": { "running": false, "bindOnly": false }
// }
// 单人存档写入 saves/<存档名>/data/，多人服务器写入脚本目录 data/ 并按世界ID区分
class BindStore {
    constructor(path) {
        this._path = path
        this.cache = null
        this.latest_path = null
    }
    get path() { return typeof this._path == 'function' ? this._path() : this._path }

    load() {
        let path = this.path
        if (this.cache && path == this.latest_path) return this.cache
        this.cache = { binds: {}, state: { running: false, bindOnly: false } }
        try {
            if (FS.exists(path)) {
                let raw = FS.open(path).read()
                if (raw && raw.length > 0) {
                    let obj = JSON.parse(raw)
                    this.cache.binds = obj?.binds ?? {}
                    this.cache.state = {
                        running: !!obj?.state?.running,
                        bindOnly: !!obj?.state?.bindOnly
                    }
                }
            }
        } catch (e) {
            mclog(`§c[老虎机] 读取绑定失败: ${e} ${path}`, 12)
        }
        this.latest_path = path
        return this.cache
    }
    save() {
        if (!this.cache) return
        try {
            let path = this.path
            let dir = path.substring(0, path.lastIndexOf('/'))
            if (dir && !FS.exists(dir)) FS.makeDir(dir)
            FS.open(path).write(JSON.stringify(this.cache))
        } catch (e) {
            mclog(`§c[老虎机] 保存绑定失败: ${e} ${this.path}`, 12)
        }
    }
    // ---- 绑定坐标 ----
    has(dim, key) { return this.load().binds[dim]?.[key] != null }
    toggle(dim, key) {
        const cache = this.load()
        if (!cache.binds[dim]) cache.binds[dim] = {}
        let now
        if (cache.binds[dim][key] !== undefined) { delete cache.binds[dim][key]; now = false }
        else { cache.binds[dim][key] = Date.now(); now = true }
        this.save()
        return now
    }
    list(dim) {
        let out = []
        for (let [d, map] of Object.entries(this.load().binds)) {
            if (dim != null && d !== dim) continue
            for (let key of Object.keys(map)) {
                let [x, y, z] = key.split(',').map(Number)
                out.push({ dim: d, x, y, z })
            }
        }
        return out
    }
    // ---- 运行状态 ----
    getState() { return { ...this.load().state } }
    setState(patch) {
        const cache = this.load()
        cache.state = { ...cache.state, ...patch }
        this.save()
        return cache.state
    }
}

const bindStore = new BindStore(
    () => {
        const id = World.getWorldIdentifier()
        // 单人存档目录
        const saveDir = file.getParent().replace(/config\\jsMacros.+/, '') + `saves/${id.replace('LOCAL_', '')}`
        // 单人：写存档内 data/；多人：写脚本目录 data/ 并带世界 ID
        return FS.exists(saveDir)
            ? `${saveDir}/data/slotmachine_binds.json`
            : `data/slotmachine_binds_${id}.json`
    }
)
const getDimension = () => World.getDimension().toString()
const posKey = (p) => `${p.x},${p.y},${p.z}`
function toggleBind(bpos) {
    let dim = getDimension()
    let key = posKey(bpos)
    if (bindStore.toggle(dim, key))
        mclog(`§a已绑定 §f${key} §7(${dim})`)
    else
        mclog(`§e已解绑 §f${key} §7(${dim})`)
}
const ServerLevel = {
    $BlockDataHelper: Java.type('xyz.wagyourtail.jsmacros.client.api.helpers.world.BlockDataHelper'),
    level() {
        try {
            let mc = Client.getMinecraft()
            let server = mc.m_91092_()
            let dim = World.getDimension()
            let keys = server.m_129784_()
            for (let i of keys)
                if (`${i.m_135782_()}` == dim)
                    return server.m_129880_(i)
        } catch { }
        return null
    },
    getChunkAt(blockpos) { return this.level()?.m_46745_(blockpos) },
    getBlockState(blockpos) { return this.level()?.m_8055_(blockpos) },
    getBlockEntity(blockpos) { return this.getChunkAt(blockpos)?.m_7702_(blockpos) },
    /** @returns {BlockDataHelper} */
    getBlockAt(blockpos) {
        try {
            let state = this.getBlockState(blockpos)
            let entity = this.getBlockEntity(blockpos)
            return new this.$BlockDataHelper(state, entity, blockpos)
        } catch { }
    }
}

if (isEnabled()) {
    // ============ 运行状态（持久化到文件）============
    const state = bindStore.getState()
    let running = state.running
    let bindOnly = state.bindOnly
    const setRunning = (v) => {
        running = v ?? !running
        bindStore.setState({ running })
        mclog(running ? '§a开始抽奖' : '§e已暂停抽奖')
        return running
    }
    const setBindOnly = (v) => {
        bindOnly = v ?? !bindOnly
        bindStore.setState({ bindOnly })
        mclog(bindOnly ? '§a忽略周边' : '§e包括周边')
        return bindOnly
    }
    mclog(running ? '§a抽奖运行中' : '§7抽奖已暂停')

    let listenters = []
    listenters.push(JsMacros.on('OpenScreen', JavaWrapper.methodToJava((e, ctx) => {
        let screen = Hud.getOpenScreen()
        if (!screen) return
        if (Reflection.getClassName(screen) == SlotMachine.screenType) {
            // 补金币仅在运行中才执行
            if (running) {
                let inv = Player.openInventory()
                if (inv && inv.getSlot(36).getCount() == 0) {
                    for (let i of inv.findItem(SlotMachine.$coin)) {
                        if (inv.getSlot(i).getCount() <= 1) continue
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
            let scale = Hud.getScaleFactor()
            let width = Hud.getWindowWidth() / scale, height = Hud.getWindowHeight() / scale
            let imgWidth = Reflection.getReflect(screen).get('f_97726_') ?? 176
            let imgHeight = Reflection.getReflect(screen).get('f_97727_') ?? 166
            /** @type {BlockPosHelper} */
            let bpos = JavaUtils.getHelperFromRaw(SlotMachine.getGuiBlockPos())
            let p3 = bpos.toPos3D(), dim = getDimension(), key = posKey(p3)

            // 绑定按钮（颜色反映是否已绑定）
            const bindLabelOf = () => bindStore.has(dim, key) ? '§a★' : '§c★'
            const bindTipsOf = () => `${bindStore.has(dim, key) ? '§c解绑' : '§a绑定'} §8(§7${key}§8)`
            let bindBtn = screen.addButton(
                (width / 2 + imgWidth / 2 - 20) | 0,
                (height / 2 - imgHeight / 2 + 5) | 0,
                12, 10, bindLabelOf(),
                JavaWrapper.methodToJava((b) => {
                    toggleBind(p3)
                    b.setLabel(bindLabelOf())
                    b.setTooltip(bindTipsOf())
                })
            ).addTooltip(bindTipsOf())

            // 运行开关按钮（颜色反映运行状态：绿=运行中，红=暂停）
            const runLabelOf = () => running ? '§a■' : '§c▶'
            const runTipsOf = () => running ? '§c暂停抽奖' : '§a开始抽奖'
            let runBtn = screen.addButton(
                (width / 2 + imgWidth / 2 - 20) | 0,
                (height / 2 - imgHeight / 2 + 18) | 0,
                12, 10, runLabelOf(),
                JavaWrapper.methodToJava((b) => {
                    setRunning()
                    b.setLabel(runLabelOf())
                    b.setTooltip(runTipsOf())
                })
            ).addTooltip(runTipsOf())
            // 周边开关按钮（颜色反映是否包含周边：绿=包括，红=忽略）
            const modeLabelOf = () => bindOnly ? '§a◎' : '§c●'
            const modeTipsOf = () => bindOnly ? '§a当前：忽略周边' : '§c当前：包括周边'
            let modeBtn = screen.addButton(
                (width / 2 + imgWidth / 2 - 20) | 0,
                (height / 2 - imgHeight / 2 + 31) | 0,
                12, 10, modeLabelOf(),
                JavaWrapper.methodToJava((b) => {
                    setBindOnly()
                    b.setLabel(modeLabelOf())
                    b.setTooltip(modeTipsOf())
                })
            ).addTooltip(modeTipsOf())
        }
    })))

    let scanner = World.getWorldScanner().withStringBlockFilter().contains(SlotMachine.$id).build()
    let spinState = false
    /** 读取老虎机方块内的物品状态 @param {BlockPosHelper} pos */
    const readSlots = (pos) => {
        let block = ServerLevel.getBlockAt(pos.getRaw()) ?? World.getBlock(pos)
        let blockEntity = block?.getRawBlockEntity()
        return blockEntity ? {
            blockEntity,
            hasCoin: blockEntity.hasValidBetInInputSlot(),
            hasReward: blockEntity.hasOutputItem()
        } : null
    }
    /** 对指定坐标执行一次抽奖/领奖/补金币
     * @param {BlockPosHelper} pos
     */
    const processMachine = (pos) => {
        let st = readSlots(pos)
        if (!st) return
        if (st.hasCoin) {
            SlotMachine.send(true, pos.getRaw())
            Client.waitTick()
            SlotMachine.send(false, pos.getRaw())
        }
        if (st.hasReward) {
            SlotMachine.claim(pos.getRaw())
            Client.waitTick()
        }
        let ply = Player.getPlayer().getBlockPos()
        let screen = Hud.getOpenScreen()
        if ((!screen || (screen && Reflection.getClassName(screen) == SlotMachine.screenType))) {
            if (_dev && ServerLevel.level()) {
                const ItemStackHelper = Java.type('xyz.wagyourtail.jsmacros.client.api.helpers.inventory.ItemStackHelper')
                let handler = Reflection.getReflect(st.blockEntity).get('itemHandler')
                let coin = new ItemStackHelper(SlotMachine.$coin, 64).getRaw()
                handler.insertItem(0, coin, false)
                Client.waitTick(3)
            } else if (pos.distanceTo(ply) <= Player.getReach()) {
                let inv = Player.openInventory()
                if (inv.getItemCount().getOrDefault(SlotMachine.$coin, 0) > 1 && !st.hasCoin) {
                    inv?.close()
                    Player.getInteractionManager().interactBlock(
                        pos.getX(), pos.getY(), pos.getZ(), 'up', false)
                    Client.waitTick(5)
                }
            }
        }
    }
    // 收集本轮要处理的机器坐标（去重）
    // 全部模式：周边扫描 + 绑定列表；仅绑定模式：绑定列表
    const collectTargets = () => {
        let dim = getDimension()
        let map = new Map()
        if (!bindOnly) {
            for (let pos of Array.from(scanner.scanAroundPlayer(12)))
                map.set(posKey(pos), PositionCommon.createBlockPos(pos.x, pos.y, pos.z))
        }
        for (let b of bindStore.list(dim))
            map.set(posKey(b), PositionCommon.createBlockPos(b.x, b.y, b.z))
        return Array.from(map.values())
    }

    _listener.on(() => {
        if (!running) return
        if (spinState) return
        spinState = true
        for (let rawPos of collectTargets())
            processMachine(rawPos)
        Client.waitTick(11)
        spinState = false
    }).offHandle = () => {
        listenters.forEach(v => JsMacros.off(v))
        listenters = []
    }
}
