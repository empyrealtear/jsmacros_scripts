// 脚本名称: 老虎机抽奖
// 功能介绍: 老虎机界面挂机抽奖（仅单人支持远程强加载区块绑定抽奖）
// 依赖模组: jsmacros、老虎机（Slot Machine)
// 更新内容: v1.0 初始化脚本
// 更新内容: v1.1 添加自动填充金币功能（可搭配背包补货升级使用）
// 更新内容: v1.2 附近老虎机批量抽奖
// 更新内容: v1.3 可在老虎机界面配置绑定机器、抽奖模式等参数
// 更新内容: v1.4 添加高亮抽奖目标功能（区分绑定/周边，颜色反映运行状态）

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
    },
    autoFillCoin() {
        let inv = Player.openInventory()
        if (!inv || inv.getSlot(36).getCount() > 0) return
        for (let i of inv.findItem(this.$coin)) {
            if (inv.getSlot(i).getCount() <= 1) continue
            inv.click(i, 0), Client.waitTick()
            inv.click(i, 1), Client.waitTick()
            inv.click(36, 0)
            break
        }
        inv.close()
    },
    /** 读取老虎机方块内的物品状态 @param {BlockPosHelper} pos */
    readSlots(pos) {
        let block = ServerLevel.getBlockAt(pos.getRaw()) ?? World.getBlock(pos)
        let be = block?.getRawBlockEntity()
        return be ? {
            blockEntity: be,
            hasCoin: be.hasValidBetInInputSlot(),
            hasReward: be.hasOutputItem()
        } : null
    },
    /** 对指定坐标执行一次抽奖/领奖/补金币 @param {BlockPosHelper} pos */
    processMachine(pos) {
        let st = this.readSlots(pos)
        if (!st) return
        if (st.hasCoin) {
            this.send(true, pos.getRaw())
            Client.waitTick()
            this.send(false, pos.getRaw())
        }
        // if (st.hasReward) {
        //     this.claim(pos.getRaw())
        //     Client.waitTick()
        // }
        let ply = Player.getPlayer().getBlockPos()
        let screen = Hud.getOpenScreen()
        if (!screen) {
            if (_dev && ServerLevel.level()) {
                const ItemStackHelper = Java.type('xyz.wagyourtail.jsmacros.client.api.helpers.inventory.ItemStackHelper')
                let handler = Reflection.getReflect(st.blockEntity).get('itemHandler')
                let coin = new ItemStackHelper(this.$coin, 64).getRaw()
                handler.insertItem(0, coin, false)
                Client.waitTick(3)
            } else if (pos.distanceTo(ply) <= Player.getReach()) {
                let inv = Player.openInventory()
                if (inv.getItemCount().getOrDefault(this.$coin, 0) > 1 && !st.hasCoin) {
                    inv?.close()
                    Player.getInteractionManager().interactBlock(
                        pos.getX(), pos.getY(), pos.getZ(), 'up', false)
                    Client.waitTick(5)
                }
            }
        }
    }
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
    },
    getChunkAt(pos) { return this.level()?.m_46745_(pos) },
    getBlockState(pos) { return this.level()?.m_8055_(pos) },
    getBlockEntity(pos) { return this.getChunkAt(pos)?.m_7702_(pos) },
    /** @returns {BlockDataHelper} */
    getBlockAt(pos) {
        try {
            return new this.$BlockDataHelper(this.getBlockState(pos), this.getBlockEntity(pos), pos)
        } catch { }
    }
}

/** 反射工具（精简：仅取 className/fieldName/methodName） */
class DeobfRef {
    static className(...names) {
        for (const n of names) try { return Reflection.getClass(n).getName() } catch { }
        return null
    }
    static fieldName(cls, ...names) {
        if (!cls) return null
        const fields = Reflection.getClass(cls).getDeclaredFields()
        for (let n of names) for (let m of fields) if (m.getName() === n) return n
        return null
    }
    static methodName(cls, ...names) {
        if (!cls) return null
        const methods = Reflection.getClass(cls).getDeclaredMethods()
        for (let n of names) for (let m of methods) if (m.getName() === n) return n
        return null
    }
    static class(...class_names) {
        for (let item of class_names) try { return new this(Java.type(item)) } catch { }
        return null
    }
    constructor(v) { this.target = v; this.reflect = Reflection.getReflect(this.target) }
    get classname() { return Reflection.getClassName(this.target) }
    get class() { try { return Reflection.getClass(this.classname) } catch { return null } }
    get fields() { return this._fields ??= this.class?.getDeclaredFields().map(v => v.getName()) ?? [] }
    get methods() { return this._methods ??= this.class?.getDeclaredMethods().map(v => v.getName()) ?? [] }
    fieldName(...names) { for (let n of names) if (this.fields.includes(n)) return n; return null }
    get(...names) {
        let name = this.fieldName(...names)
        if (name) try { return this.reflect.field(name).get() } catch { return this.target[name] }
        return null
    }
    methodName(...names) { for (let n of names) if (this.methods.includes(n)) return n; return null }
    invoke(method_name, ...args) {
        try {
            return args.length == 0 ? this.reflect.call(method_name).get()
                : this.reflect.call(method_name, ...args).get()
        } catch { return this.target[method_name]?.(...args) }
    }
    call(method_names, ...args) {
        let name = this.methodName(...method_names)
        return name ? this.invoke(name, ...args) : null
    }
}

/** Draw2D 扩展：裁剪画布 + 悬浮 tooltip 渲染（来自雷达脚本，精简版） */
class Draw2DUtils {
    /** @type {net.minecraft.client.gui.Font} */
    static Font = new DeobfRef(Client.getMinecraft()).get('font', 'field_1772', 'textRenderer', 'f_91114_', 'f_91062_')
    /** @type {JavaClass<Draw2D>} */
    static Draw2D = Reflection.getClass(
        'xyz.wagyourtail.jsmacros.client.api.classes.render.Draw2D',
        'com.jsmacrosce.jsmacros.client.api.classes.render.Draw2D')
    /** @type {DeobfRef<DrawContext>} */
    static DrawContext = DeobfRef.class(
        'net.minecraft.client.gui.GuiGraphics', 'net.minecraft.class_332',
        'net.minecraft.client.gui.DrawContext', 'net.minecraft.src.C_279497_')
    /**
     * 创建限制显示范围画布
     * @param {{x:int,y:int,width:int,height:int}} region
     * @param {(drawContext:any) => void} [onrender]
     * @returns {Draw2D}
     */
    static createDraw2D(region, onrender) {
        let builder = Reflection.createClassProxyBuilder(this.Draw2D)
        let on = this.DrawContext.methodName('enableScissor', 'method_44379', 'm_280588_')
        let off = this.DrawContext.methodName('disableScissor', 'method_44380', 'm_280618_')
        if (on && off) {
            builder.addMethod('render', JavaWrapper.methodToJava((proxyRef, args) => {
                let dcref = new DeobfRef(args[0])
                dcref.call(['flush', 'method_51452', 'draw', 'm_280262_'])
                let { x, y, width, height } = region
                dcref.invoke(on, x | 0, y | 0, (x + width) | 0, (y + height) | 0)
                let result = proxyRef.parent(args)
                dcref.invoke(off)
                try { onrender && onrender(...args) } catch { }
                return result
            }))
            let proxy = builder.buildInstance([])
            proxy.widthSupplier = () => region.width
            proxy.heightSupplier = () => region.height
            return proxy
        }
        return Hud.createDraw2D()
    }
    /**
     * 绘制气泡提示框
     * @param {any} graphics
     * @param {JavaArray<Component>} components
     * @param {int} x @param {int} y @param {number} scale
     */
    static renderToolTip(graphics, components, x, y, scale) {
        if (!graphics) return
        let ox = Math.round(x ?? Hud.getMouseX()), oy = Math.round(y ?? Hud.getMouseY())
        let method = ['setComponentTooltipForNextFrame', 'renderComponentTooltip',
            'method_51434', 'drawTooltip', 'm_403688_', 'm_280666_']
        let getPositionMatrix = DeobfRef.methodName(DeobfRef.className(
            'com.mojang.blaze3d.vertex.PoseStack$Pose', 'net.minecraft.class_4587$class_4665',
            'net.minecraft.client.util.math.MatrixStack$Entry', 'net.minecraft.src.C_3181_$C_3183_'
        ), 'pose', 'method_23761', 'getPositionMatrix', 'm_252922_')
        let graph = new DeobfRef(graphics)
        let stack = new DeobfRef(graph.call(['pose', 'method_51448', 'getMatrices', 'm_280168_']))
        stack.call(['pushPose', 'method_22903', 'push', 'm_85836_'])
        let last = stack.call(['last', 'method_23760', 'peek', 'm_85850_'])
        new DeobfRef(last).invoke(getPositionMatrix).identity()
        stack.call(['scale', 'method_22905', 'm_85841_'], scale ?? 1, scale ?? 1, 1)
        try {
            graph.call(method, this.Font, components, ox, oy)
            graph.call(['renderDeferredElements', 'method_73199', 'drawDeferredElements', 'm_280637_'])
        } catch {
            graph.call(method, this.Font, components, ox, oy,
                Client.getRegistryManager().getItemStack('minecraft:air').getRaw())
        }
        stack.call(['popPose', 'method_22909', 'pop', 'm_85849_'])
    }
    /**
     * @param {{x:int,y:int,width:int,height:int}} region
     * @param {(self:Draw2DUtils,drawContext:any) => void} onrender
     */
    constructor(region, onrender) {
        this.region = region
        this.onrender = onrender
        this.target = Draw2DUtils.createDraw2D(this.region, (ctx) => this.render(ctx))
        /** @type {{x:number,y:number,scale:number,tips:string[]}[]} */
        this.tooltips = []
        /** @type {null|((self:Draw2DUtils) => {x:number,y:number,scale:number,tips:string[]}[])} */
        this.dynamicTooltips = null
    }
    asComponents(tooltips) {
        let arr = JavaUtils.createArrayList()
        for (let v of tooltips) arr.add(Chat.createTextHelperFromString(v).getRaw())
        return arr
    }
    render(drawContext) {
        this.onrender && this.onrender(this, drawContext)
        if (this.dynamicTooltips) this.tooltips = this.dynamicTooltips(this)
        if (this.tooltips.length > 0) {
            for (let i of this.tooltips) {
                if (!i.tips || i.tips.length == 0) continue
                let x = i.x ?? Hud.getMouseX(), y = i.y ?? Hud.getMouseY()
                let components = this.asComponents(i.tips)
                let scale = i.scale ?? 1
                Draw2DUtils.renderToolTip(drawContext, components, x / scale, y / scale, scale)
            }
        }
    }
    setTooltip(v) { typeof v == 'function' ? this.dynamicTooltips = v : this.tooltips = v }
    removeTooltip() { this.tooltips = []; this.dynamicTooltips = null }
}

/** 事件
 * @typedef {{timestamp:number,interval:number,mouse:any}} eventCache
 * @typedef {'holding'|'pressed'|'released'} enum_keyState
 */
class Event {
    static DRAG_LIMIT = 1
    static DBCLICK_INTERVAL = 300
    static LEFTCLICK = 'key.mouse.left'
    static RIGHTCLICK = 'key.mouse.right'
    static MIDCLICK = 'key.mouse.middle'
    static SHIFT = 'key.keyboard.left.shift'
    static ALT = 'key.keyboard.left.alt'
    /** @type {Record<string,eventCache>} */
    static cache = {}
    /** @type {string[]} */
    static latest = []
    static update(key, props) { Event.cache[key] = { ...Event.cache[key], ...props } }
    constructor() {
        this.timestamp = Date.now()
        this.mouse = PositionCommon.createPos(Hud.getMouseX(), Hud.getMouseY())
        this.keys = Array.from(KeyBind.getPressedKeys())
        /** @type {Record<string,{state:enum_keyState,cache:eventCache}>} */
        this.keyStates = {}
        this.consumed = false
        let latest = new Set(Event.latest)
        let all_keys = new Set(this.keys.concat(latest))
        for (let key of all_keys) {
            let isPressed = this.keys.includes(key)
            let wasPressed = latest.has(key)
            if (isPressed) {
                if (wasPressed) this.keyStates[key] = { state: 'holding', cache: Event.cache[key] }
                else {
                    let cache = Event.cache[key]
                    Event.cache[key] = {
                        timestamp: this.timestamp,
                        interval: cache ? this.timestamp - cache.timestamp : -1,
                        mouse: this.mouse
                    }
                    this.keyStates[key] = { state: 'pressed', cache: Event.cache[key] }
                }
            } else if (wasPressed) {
                this.keyStates[key] = { state: 'released', cache: Event.cache[key] }
            }
        }
        Event.latest = [...this.keys]
    }
    drag(button = Event.LEFTCLICK) {
        let kv = this.keyStates[button]
        if (kv && kv.state == 'holding') {
            let vec = kv.cache.mouse.toReverseVector(this.mouse)
            if (vec.getMagnitude() > Event.DRAG_LIMIT) return vec
        }
        return null
    }
    click(button = Event.LEFTCLICK) { return this.keyStates[button]?.state == 'pressed' }
    dbclick(button = Event.LEFTCLICK) {
        let kv = this.keyStates[button]
        return kv?.state == 'pressed' && kv.cache?.interval > 0 && kv.cache?.interval <= Event.DBCLICK_INTERVAL
    }
    stopPropagation() { this.consumed = true }
}
/** 事件池 */
class EventBus {
    constructor() {
        this.tick = null
        /** @type {Record<string, {handle:(event:Event)=>void, clickTimer?:number}>} */
        this.events = {}
    }
    static uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            let r = (Math.random() * 16) | 0
            let v = c === 'y' ? (r & 0x3) | 0x8 : r
            return v.toString(16)
        })
    }
    start() {
        if (this.tick) return
        this.tick = JsMacros.on('Tick', JavaWrapper.methodToJava(() => {
            let event = new Event()
            for (let key in this.events) {
                let rec = this.events[key]
                if (!rec?.handle) continue
                try {
                    if (!rec.clickTimer) rec.handle(event)
                    else if (rec.clickTimer <= Date.now()) {
                        let handle = rec.handle
                        this.remove(key)
                        handle(event)
                    }
                } catch (e) { Chat.log(e) }
            }
        }))
    }
    addListener(handle) {
        let key = `tick-${EventBus.uuid()}`
        this.events[key] = { handle: handle }
        return key
    }
    setTimeout(handle, delay) {
        let key = `once-${EventBus.uuid()}`
        this.events[key] = { handle: handle, clickTimer: Date.now() + delay }
        return key
    }
    remove(key) { if (key && key in this.events) delete this.events[key] }
    stop() { if (this.tick) JsMacros.off(this.tick), this.tick = null; this.events = {} }
}

/** 自绘按钮（来自雷达脚本，精简版） */
class Button {
    /**
     * @param {Draw2D} parent
     * @param {{
     *  x:number,y:number,width:number,height:number,
     *  enabled:boolean|(self:Button)=>boolean,
     *  text:string|(self:Button,enabled:boolean)=>string,
     *  onClick:(self:Button,event:Event)=>void,
     *  onHover:(self:Button,event:Event)=>void
     * }} opts
     */
    constructor(parent, opts) {
        const { x, y, width, height, enabled, text, onClick, onHover } = opts
        this.parent = parent
        /** @type {{text:any,background:any}} */
        this.elements = {}
        this._textFn, this.text = text ?? ''
        this._enabledFn, this.enabled = enabled ?? false
        this.x = x ?? 0
        this.y = y ?? 0
        this.width = width ?? 0
        this.height = height ?? 0
        this.onClick = onClick ?? (() => { })
        this.onHover = onHover ?? (() => { })
    }
    get enabled() { return this._enabledFn(this) }
    set enabled(v) { this._enabledFn = typeof v == 'function' ? v : v }
    get text() { return this._textFn(this) }
    set text(v) { this._textFn = typeof v == 'function' ? v : v }
    buildandAdd() {
        this.remove()
        this.elements['background'] = this.parent.rectBuilder()
            .pos1(this.x | 0, this.y | 0).size(this.width, this.height)
            .color(0x000000).alpha(200).buildAndAdd()
        this.elements['text'] = this.parent.textBuilder()
            .scale(1).text(this.text)
            .color(0xFFFFFF).align(this.elements['background'], 'CenterOnCenter', 'CenterOnCenter')
            .buildAndAdd()
        return this
    }
    update() {
        this.elements['text'].setText(this.text)
            .align(this.elements['background'], 'CenterOnCenter', 'CenterOnCenter')
        return this
    }
    remove() {
        Object.values(this.elements).forEach(v => this.parent.reAddElement(v))
        this.elements = {}
    }
    /** @param {Event} event */
    focus(event) {
        let dx = event.mouse.getX() - this.x, dy = event.mouse.getY() - this.y
        return dx > 0 && dy > 0 && dx < this.width && dy < this.height
    }
    /** @param {Event} event */
    tick(event) {
        this.update()
        if (event.consumed) return
        if (this.focus(event)) {
            this.onHover(this, event)
            if (event.click()) {
                if (typeof this._enabledFn !== 'function') this.enabled = !this.enabled
                this.onClick(this, event)
            }
            event.consumed = true
        }
    }
}

/** 持久化存储：绑定坐标 + 运行状态 */
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
        this.cache = { binds: {}, state: { running: false, bindOnly: false, highlight: false } }
        try {
            if (FS.exists(path)) {
                let raw = FS.open(path).read()
                if (raw && raw.length > 0) {
                    let obj = JSON.parse(raw)
                    this.cache.binds = obj?.binds ?? {}
                    this.cache.state = {
                        running: !!obj?.state?.running,
                        bindOnly: !!obj?.state?.bindOnly,
                        highlight: !!obj?.state?.highlight
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
    getState() { return { ...this.load().state } }
    setState(patch) {
        const cache = this.load()
        cache.state = { ...cache.state, ...patch }
        this.save()
        return cache.state
    }
    posKey(p) {
        const x = typeof p.getX === 'function' ? p.getX() : p.x
        const y = typeof p.getY === 'function' ? p.getY() : p.y
        const z = typeof p.getZ === 'function' ? p.getZ() : p.z
        return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`
    }
    toggleBind(pos) {
        let dim = World.getDimension()
        let key = this.posKey(pos)
        mclog(`${this.toggle(dim, key) ? '§a已绑定' : '§e已解绑'} §f${key} §7(${dim})`)
    }
}

const bindStore = new BindStore(
    () => {
        const id = World.getWorldIdentifier()
        const saveDir = file.getParent().replace(/config\\jsMacros.+/, '') + `saves/${id.replace('LOCAL_', '')}`
        return FS.exists(saveDir)
            ? `${saveDir}/data/slotmachine_binds.json`
            : `data/slotmachine_binds_${id}.json`
    }
)

/** 生成按钮配置（全局） */
const getBtnConfigs = (ctx) => [
    {
        label: '运行',
        getState: () => bindStore.getState().running,
        getText: (on) => on ? '§a■' : '§c▶',
        getTip: (on) => on ? '§c暂停抽奖' : '§a开始抽奖',
        onClick: (on) => bindStore.setState({ running: on })
    },
    {
        label: '周边',
        getState: () => bindStore.getState().bindOnly,
        getText: (on) => on ? '§a◎' : '§c●',
        getTip: (on) => on ? '§a当前：忽略周边' : '§c当前：包括周边',
        onClick: (on) => bindStore.setState({ bindOnly: on })
    },
    {
        label: '高亮',
        getState: () => bindStore.getState().highlight,
        getText: (on) => on ? '§a◆' : '§7◇',
        getTip: (on) => on ? '§a当前：高亮' : '§c当前：隐藏',
        onClick: (on) => {
            bindStore.setState({ highlight: on })
            highlighter.toggle(on)
        }
    },
    {
        label: '绑定',
        getState: () => bindStore.has(ctx.dim, ctx.key),
        getText: (on) => on ? '§a★' : '§c★',
        getTip: (on) => `${on ? '§c解绑' : '§a绑定'} §8(§7${ctx.key}§8)`,
        onClick: () => bindStore.toggleBind(ctx.bpos)
    }
]

// ============ 高亮：绑定 + 周边目标，颜色反映状态 ============
const highlighter = {
    d3d: null,
    enabled: false,
    _tick: null,
    _sig: '',
    rebuild(force) {
        if (!this.enabled || !this.d3d) return
        const dim = World.getDimension()
        const isRunning = bindStore.getState().running
        const targets = collectTargets()
        const sig = `${isRunning}|${bindStore.getState().bindOnly}|` + targets.map(p =>
            `${p.x},${p.y},${p.z}:${bindStore.has(dim, bindStore.posKey(p)) ? 1 : 0}`
        ).join(';')
        if (!force && sig === this._sig) return
        this._sig = sig
        this.d3d.clear()
        for (const pos of targets) {
            const color = bindStore.has(dim, bindStore.posKey(pos))
                ? (isRunning ? 0x00FF00 : 0xFFFF00)
                : (isRunning ? 0x00FFFF : 0xFF8800)
            this.d3d.boxBuilder()
                .forBlock(pos.getX() | 0, pos.getY() | 0, pos.getZ() | 0)
                .color(color).fill(false).cull(false)
                .buildAndAdd()
        }
    },
    start() {
        if (this.enabled) return
        this.enabled = true
        this.d3d ??= Hud.createDraw3D()
        this.d3d.register()
        this._sig = ''
        this.rebuild(true)
        this._tick = JsMacros.on('Tick', JavaWrapper.methodToJava(() => this.rebuild()))
    },
    stop() {
        this.enabled = false
        if (this._tick) { JsMacros.off(this._tick); this._tick = null }
        if (this.d3d) { this.d3d.clear(); this.d3d.unregister() }
        this._sig = ''
    },
    toggle(v) {
        (v ?? !this.enabled) ? this.start() : this.stop()
        return this.enabled
    }
}

// 收集本轮要处理的机器坐标（去重）
const collectTargets = () => {
    let dim = World.getDimension()
    let map = new Map()
    if (!bindStore.getState().bindOnly) {
        let scanner = World.getWorldScanner().withStringBlockFilter().contains(SlotMachine.$id).build()
        for (let pos of Array.from(scanner.scanAroundPlayer(12)))
            map.set(bindStore.posKey(pos), PositionCommon.createBlockPos(pos.x, pos.y, pos.z))
    }
    for (let b of bindStore.list(dim))
        map.set(bindStore.posKey(b), PositionCommon.createBlockPos(b.x, b.y, b.z))
    return Array.from(map.values())
}

if (isEnabled()) {
    // ============ 运行状态（持久化到文件）============
    const bus = new EventBus()
    bus.start()
    let listenters = []

    listenters.push(JsMacros.on('OpenScreen', JavaWrapper.methodToJava((e, ctx) => {
        let screen = Hud.getOpenScreen()
        if (!(screen && Reflection.getClassName(screen) == SlotMachine.screenType)) return
        // 补金币仅在运行中才执行
        if (bindStore.getState().running)
            SlotMachine.autoFillCoin()
        /** @type {BlockPosHelper} */
        let bpos = JavaUtils.getHelperFromRaw(SlotMachine.getGuiBlockPos())
        let dim = World.getDimension(), key = bindStore.posKey(bpos)
        // ============ Draw2D 裁剪画布 + 悬浮 tooltip ============
        const sw = (Hud.getWindowWidth() / Hud.getScaleFactor()) | 0
        const sh = (Hud.getWindowHeight() / Hud.getScaleFactor()) | 0
        let imgw = Reflection.getReflect(screen).get('f_97726_') ?? 176
        let imgh = Reflection.getReflect(screen).get('f_97727_') ?? 166
        let tipDraw = new Draw2DUtils({ x: 0, y: 0, width: sw, height: sh })
        screen.addDraw2D(tipDraw.target, 0, 0, 0, 0, 0)

        // 右下角定位
        const btnW = 10, btnH = 10, gap = 2
        const baseX = (sw / 2 + imgw / 2 - 5 - (btnW + gap) * 4) | 0
        const baseY = (sh / 2 - imgh / 2 + 5) | 0
        /** @type {Button[]} */
        let btns = []
        let btnConfigs = getBtnConfigs({ dim, key, bpos })
        for (let i = 0; i < btnConfigs.length; i++) {
            const cfg = btnConfigs[i]
            const getState = cfg.getState
            let b = new Button(tipDraw.target, {
                x: baseX + i * (btnW + gap), y: baseY,
                width: btnW, height: btnH,
                enabled: getState,
                text: (self) => cfg.getText(self.enabled),
                onHover: (self) => tipDraw.tooltips = [{ tips: [cfg.getTip(self.enabled)] }],
                onClick: (self) => cfg.onClick(!self.enabled)
            })
            btns.push(b.buildandAdd())
        }
        
        let uiListener = bus.addListener(event => {
            const cur = Hud.getOpenScreen()
            if (!cur || Reflection.getClassName(cur) != SlotMachine.screenType) {
                bus.remove(uiListener)
                tipDraw.removeTooltip()
                return
            }
            tipDraw.removeTooltip()
            for (let b of btns) {
                if (event.consumed) break
                b.tick(event)
            }
        })
    })))

    if (bindStore.getState().highlight) highlighter.start()
    let spinState = false
    _listener.on(() => {
        if (!bindStore.getState().running || spinState) return
        spinState = true
        for (let pos of collectTargets())
            SlotMachine.processMachine(pos)
        Client.waitTick(11)
        spinState = false
    }).offHandle = () => {
        listenters.forEach(v => JsMacros.off(v))
        listenters = []
        bus.stop()
        highlighter.stop()
    }
}
