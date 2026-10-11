// 脚本名称: 失落城市雷达数据
// 功能介绍: 在Xaero世界地图上显示失落城市雷达数据（鼠标悬停区块显示tooltip，Shift+左键标记已去过，自动记录有建筑的区块，H键切换标记渲染）
// 依赖模组: jsmacros、Xaero地图(Xaero's World Map)、失落城市雷达(LostRadar)
// 更新内容: v1.0 初始化脚本
// 更新内容: v1.1 自动记录停留过的建筑区块，允许添加为常驻服务脚本，修复未正确获取维度名
// 更新内容: v1.2 根据成就完成记录显示建筑是否已收集
// 更新内容: v1.3 H键切换标记显示，高亮显示出建筑标记状态，按存档名隔离存储数据，若已使用之前版本需要手动改为新文件名
// 更新内容: v1.4 大型建筑按 buildings 数量扩展相邻同名区块，手动标注和自动记录统一处理

const scriptName = 'XareoMap_LostRadar.ToggleScript'
/** 已去过区块的存储路径 */
const VISITED_PATH = () => `lostradar_visited_${World.getWorldIdentifier()}.json`
/** 渲染半径（区块） */
const MARKER_RADIUS = 8

/**
 * 输出带脚本名前缀的聊天日志
 * @param {string} msg 日志内容
 * @param {number} [color=0x7] 文本颜色
 */
const mclog = (msg, color = 0x7) => Chat.log(Chat.createTextBuilder()
    .append("[").withColor(0x5).append(scriptName).withColor(0x5)
    .append("]").withColor(0x5).append(" " + msg).withColor(color).build())

/** @returns {boolean} 脚本是否处于启用状态 */
const isToggle = () => GlobalVars.getBoolean(scriptName)
/**
 * 设置脚本启用状态
 * @param {boolean} v
 */
const setToggle = (v) => {
    GlobalVars.putBoolean(scriptName, v)
    mclog(v ? "启用" : "关闭")
}

/** 
 * @typedef {com.mojang.blaze3d.platform.Window} Window
 * @typedef {net.minecraft.network.chat.Component} Component
 * @typedef {net.minecraft.client.gui.DrawContext} DrawContext
 * @typedef {net.minecraft.client.font.TextRenderer} TextRenderer
 * 
 * @typedef {Packages.xyz.wagyourtail.jsmacros.api.math.Pos2D} type_pos2d
 * @typedef {Packages.xyz.wagyourtail.jsmacros.api.math.Vec2D} type_vec2d
 * @typedef {{timestamp:number,interval:number,mouse:type_pos2d}} eventCache
 * @typedef {'holding'|'pressed'|'released'} enum_keyState
 * @typedef {(event:Event)=>void} handle_eventCallback
 * @typedef {{
 *  keyPressed: ((keyCode:int,modifiers:int)=>void),
 *  charTyped: ((char:char,modifiers:int)=>void),
 *  mouseDown: ((pos:type_pos2d,button:int,dbclick:boolean)=>void),
 *  mouseUp: ((pos:type_pos2d,button:int,dbclick:boolean)=>void),
 *  mouseDrag: ((vec:type_vec2d,button:int)=>void),
 * }} handle_screenCallback
 */

/** @type {JavaClass<ChunkPos>} */
const ChunkPos = Java.type('net.minecraft.world.level.ChunkPos')
/** @type {mcjty.lostradar.data.ClientMapData} @link {https://github.com/McJtyMods/LostRadar} */
const ClientMapData = Java.type('mcjty.lostradar.data.ClientMapData').getData()

/** @returns {ClientLevel} 主世界 ClientLevel */
function getClientLevel() {
    const mc = Client.getMinecraft()
    return new DeobfRef(mc).get('level', 'field_1687', 'world', 'f_91073_')
}

/**
 * 获取玩家当前所在区块 key
 * @returns {string|null} "cx,cz"；玩家不存在返回 null
 */
function getPlayerChunkKey() {
    const player = Player.getPlayer()
    if (!player) return null
    const chunk = player.getChunk()
    return `${chunk.getChunkX()},${chunk.getChunkZ()}`
}

/**
 * 扩展相邻同名建筑区块，直到收集到 targetCount 个
 * @param {number} cx 中心区块 X
 * @param {number} cz 中心区块 Z
 * @param {string} dim 维度
 * @param {mcjty.lostradar.data.MapPalette$PaletteEntry} centerEntry 中心区块条目
 * @returns {string[]} 区块 key 列表（含自身）
 */
function expandSameName(cx, cz, dim, centerEntry) {
    const name = centerEntry.name()
    const targetCount = Math.max(1, Array.from(centerEntry.buildings()).length)
    const level = getClientLevel()

    const visited = new Set([`${cx},${cz}`])
    const queue = [[cx, cz]]

    while (queue.length > 0 && visited.size < targetCount) {
        const [x, z] = queue.shift()

        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (visited.size >= targetCount) break
            const nx = x + dx
            const nz = z + dz
            const nkey = `${nx},${nz}`
            if (visited.has(nkey)) continue

            let nEntry = null
            try {
                nEntry = ClientMapData.getPaletteEntry(level, new ChunkPos(nx, nz))
            } catch (e) { /* 忽略 */ }
            if (!nEntry || nEntry.name() !== name) continue

            visited.add(nkey)
            queue.push([nx, nz])
        }
    }
    return Array.from(visited)
}

/** 反射工具 @template T */
class DeobfRef {
    /** @param {T} v 被反射包装的对象或 Java 类 */
    constructor(v) {
        /** @type {T} */
        this.target = v
        /** @type {Packages.org.joor.Reflect} */
        this.reflect = Reflection.getReflect(this.target)
    }
    /**
     * 按顺序尝试加载类，返回第一个成功的
     * @template {string} C
     * @param {C[]} class_names
     * @returns {GetJava.Type$Graal<C>|null}
     */
    static Type(...class_names) {
        for (let item of class_names)
            try { return Java.type(item) } catch { }
        return null
    }
    /**
     * 获取类并包装为 DeobfRef
     * @template {string} C
     * @param {C[]} class_names
     * @returns {DeobfRef<C>|null}
     */
    static Class(...class_names) {
        let type = DeobfRef.Type(...class_names)
        return type ? new DeobfRef(type) : null
    }
    /** @returns {string} 类名 */
    get classname() { return Reflection.getClassName(this.target) }
    /** @returns {GetJava.Type$Graal<T>} Graal 版 Java 类 */
    get type() { return Java.type(Reflection.getClassName(this.target)) }
    /** @returns {JavaClass<T>} 反射版 Java 类 */
    get class() { return Reflection.getClass(Reflection.getClassName(this.target)) }
    /** @returns {string[]} 所有字段名（缓存） */
    get fields() { return this._fields ??= this.class.getDeclaredFields().map(v => v.getName()) }
    /** @returns {string[]} 所有方法名（缓存） */
    get methods() { return this._methods ??= this.class.getDeclaredMethods().map(v => v.getName()) }
    /** @returns {JavaClass<any>} 父类 */
    get parent() { return this.class.getSuperclass() }

    /**
     * 获取第一个存在的字段名
     * @param {string[]} names 候选字段名（按优先级）
     * @returns {string|null}
     */
    getFieldName(...names) {
        let fields = this.fields
        for (let name of names)
            if (fields.includes(name)) return name
        return null
    }
    /**
     * 获取字段值
     * @param {string[]} names 候选字段名（按优先级）
     * @returns {*} 字段值；未找到返回 null
     */
    get(...names) {
        let name = this.getFieldName(...names)
        if (name)
            try { return this.reflect.field(name).get() }
            catch { return this.target[name] }
        return null
    }
    /**
     * 设置字段值
     * @param {*} value 新值
     * @param {string[]} names 候选字段名（按优先级）
     * @returns {*} 设置后的字段值；未找到返回 null
     */
    set(value, ...names) {
        let name = this.getFieldName(...names)
        if (name)
            try { return this.reflect.set(name, value).get() }
            catch {
                this.target[name] = value
                return this.target[name]
            }
        return null
    }
    /**
     * 获取第一个存在的方法名
     * @param {string[]} method_names 候选方法名（按优先级）
     * @returns {string|null}
     */
    getMethodName(...method_names) {
        let methods = this.methods
        for (let name of method_names)
            if (methods.includes(name))
                return name
        return null
    }
    /**
     * 按方法名调用
     * @param {string} method_name 方法名
     * @param {*[]} args 参数列表
     * @returns {*} 方法返回值
     */
    invoke(method_name, ...args) {
        try {
            return args.length == 0 ?
                this.reflect.call(method_name).get() :
                this.reflect.call(method_name, ...args).get()
        } catch {
            return this.target[method_name]?.(...args)
        }
    }
    /**
     * 按候选方法名调用
     * @param {string[]} method_names 候选方法名（按优先级）
     * @param {*[]} args 参数列表
     * @returns {*} 方法返回值；未找到返回 null
     */
    call(method_names, ...args) {
        let name = this.getMethodName(...method_names)
        return name ? this.invoke(name, ...args) : null
    }
}

/** Draw2D拓展：支持裁剪画布+渲染提示框
 * @typedef {{x:int,y:int,width:int,height:int}} Region 显示区域
 */
class Draw2DUtils {
    /** @type {DeobfRef<org.lwjgl.glfw.GLFW>} */
    static GLFW = DeobfRef.Class('org.lwjgl.glfw.GLFW')
    /** @type {DeobfRef<Window>} */
    static Window = new DeobfRef(new DeobfRef(Client.getMinecraft()).call(['getWindow', 'method_22683', 'm_91268_']))
    /**
     * @enum {int}
     * @link https://github.com/LWJGL/lwjgl3/blob/master/modules/lwjgl/glfw/src/generated/java/org/lwjgl/glfw/GLFW.java
     */
    static CursorTypes = {
        DEFAULT: 0x36001, ARROW: 0x36001, IBEAM: 0x36002, CROSSHAIR: 0x36003,
        POINTING_HAND: 0x36004, RESIZE_EW: 0x36005, RESIZE_NS: 0x36006,
        RESIZE_NWSE: 0x36007, RESIZE_NESW: 0x36008, RESIZE_ALL: 0x36009,
        NOT_ALLOWED: 0x3600A, HRESIZE: 0x36005, VRESIZE: 0x36006, HAND: 0x36004
    }
    /** @type {TextRenderer} */
    static TextRenderer = new DeobfRef(Client.getMinecraft())
        .get('font', 'field_1772', 'textRenderer', 'f_91114_', 'f_91062_')
    /** @type {JavaClass<Draw2D>} */
    static Draw2D = Reflection.getClass(
        'xyz.wagyourtail.jsmacros.client.api.classes.render.Draw2D',
        'com.jsmacrosce.jsmacros.client.api.classes.render.Draw2D')
    /** @type {DeobfRef<DrawContext>} */
    static DrawContext = DeobfRef.Class(
        'net.minecraft.client.gui.GuiGraphics', 'net.minecraft.class_332',
        'net.minecraft.client.gui.DrawContext', 'net.minecraft.src.C_279497_')
    /** @type {DeobfRef<com.mojang.blaze3d.platform.cursor.CursorType>} */
    static CursorType = DeobfRef.Class(
        'com.mojang.blaze3d.platform.cursor.CursorType', 'net.minecraft.class_11875',
        'net.minecraft.client.gui.cursor.Cursor', 'net.minecraft.src.C_411411_')

    /**
     * 创建限制显示范围画布
     * @param {Region} region 显示区域
     * @param {(drawContext:DrawContext) => void} [onrender] 每帧渲染回调
     * @returns {Draw2D} 裁剪后的 Draw2D
     */
    static createDraw2D(region, onrender) {
        let builder = Reflection.createClassProxyBuilder(Draw2DUtils.Draw2D)
        let on = Draw2DUtils.DrawContext.getMethodName('enableScissor', 'method_44379', 'm_280588_')
        let off = Draw2DUtils.DrawContext.getMethodName('disableScissor', 'method_44380', 'm_280618_')
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
     * 设置鼠标样式
     * @param {keyof typeof Draw2DUtils.CursorTypes} name 样式名称
     * @param {DrawContext|null} [drawContext=null] 画板
     */
    static selectCursor(name, drawContext) {
        let shape = Draw2DUtils.CursorTypes[name]
        if (drawContext && Draw2DUtils.CursorType) {
            if (name == 'DEFAULT') return
            let DEFAULT = Draw2DUtils.CursorType.get('DEFAULT', 'field_62449', 'f_412642_')
            let createStandardCursor = Draw2DUtils.CursorType.getMethodName(
                'createStandardCursor', 'method_74031', 'createStandard', 'm_416152_')
            createStandardCursor && new DeobfRef(drawContext).call(
                ['requestCursor', 'method_74037', 'setCursor', 'm_417638_'],
                Draw2DUtils.CursorType.invoke(createStandardCursor, shape, name, DEFAULT)
            )
            return
        }
        Draw2DUtils.GLFW.invoke(
            'glfwSetCursor',
            Draw2DUtils.Window.get('window', 'field_5187', 'handle', 'f_85349_', 'f_413219_'),
            Draw2DUtils.GLFW.invoke('glfwCreateStandardCursor', shape))
    }
    /**
     * 绘制气泡提示框
     * @param {DrawContext} drawContext 画板
     * @param {int} x 坐标
     * @param {int} y 坐标
     * @param {JavaArray<Component>} components 格式化文本列表
     */
    static renderToolTip(drawContext, x, y, components) {
        if (drawContext) {
            let method = [
                'setComponentTooltipForNextFrame', 'renderComponentTooltip',
                'method_51434', 'drawTooltip', 'm_403688_', 'm_280666_'
            ]
            let dcref = new DeobfRef(drawContext)
            try {
                dcref.call(method, Draw2DUtils.TextRenderer, components, Math.round(x), Math.round(y))
                dcref.call(['renderDeferredElements', 'method_73199', 'drawDeferredElements', 'm_280637_'])
            } catch {
                dcref.call(method, Draw2DUtils.TextRenderer, components, Math.round(x), Math.round(y),
                    Player.getPlayer().getMainHand().getRaw())
            }
        }
    }

    /**
     * @param {Region} region 区域
     * @param {(self:Draw2DUtils,drawContext:DrawContext) => void} onrender 渲染事件
     */
    constructor(region, onrender) {
        /** @type {Region} 区域 */
        this.region = region
        /** @type {(self:Draw2DUtils,drawContext:DrawContext) => void} 渲染事件 */
        this.onrender = onrender
        /** @type {Draw2D} */
        this.target = Draw2DUtils.createDraw2D(this.region, (ctx) => this.render(ctx))
        /** @type {keyof typeof Draw2DUtils.CursorTypes} 鼠标样式 */
        this.cursor = 'DEFAULT'
        /** @type {string[]} 提示框内容 */
        this.tooltips = []
        /** @type {null|((self:Draw2DUtils) => string[])} */
        this.dynamicTooltips = null
    }
    /** @returns {JavaArray<Component>} 气泡提示框内容组件 */
    getToolTipComponents() {
        let arr = JavaUtils.createArrayList()
        for (let v of this.tooltips)
            arr.add(Chat.createTextHelperFromString(v).getRaw())
        return arr
    }
    /** @param {DrawContext} drawContext */
    render(drawContext) {
        this.onrender && this.onrender(this, drawContext)
        if (this.cursor)
            Draw2DUtils.selectCursor(this.cursor, drawContext)
        if (this.dynamicTooltips)
            this.tooltips = this.dynamicTooltips(this)
        if (this.tooltips.length > 0) {
            let components = this.getToolTipComponents()
            Draw2DUtils.renderToolTip(drawContext, Hud.getMouseX(), Hud.getMouseY(), components)
        }
    }
    /** @param {string[]|(self:Draw2DUtils) => string[]} v */
    setTooltip(v) { typeof v == 'function' ? this.dynamicTooltips = v : this.tooltips = v }
    /** 清除提示框 */
    removeTooltip() { this.tooltips = []; this.dynamicTooltips = null }
}

/** Xaero 世界地图屏幕的坐标转换封装 */
class GuiMap {
    /** @param {IScreen} screen */
    constructor(screen) {
        /** @type {IScreen} */
        this.raw = screen
        /** @type {Packages.org.joor.Reflect} */
        this.target = Reflection.getReflect(screen)
    }
    /** @returns {number} 屏幕宽（GUI 缩放坐标） */
    get width() { return this.raw.getWidth() }
    /** @returns {number} 屏幕高（GUI 缩放坐标） */
    get height() { return this.raw.getHeight() }
    /** @returns {number} 地图缩放比例 */
    get mapScale() { return this.target.get('scale') }
    /** @returns {number} 鼠标所在方块 X 坐标 */
    get mouseBlockPosX() { return this.target.get('mouseBlockPosX') }
    /** @returns {number} 鼠标所在方块 Y 坐标 */
    get mouseBlockPosY() { return this.target.get('mouseBlockPosY') }
    /** @returns {number} 鼠标所在方块 Z 坐标 */
    get mouseBlockPosZ() { return this.target.get('mouseBlockPosZ') }
    /** @returns {type_pos2d} 鼠标所在方块坐标 */
    get mouseBlockPos() { return PositionCommon.createPos(this.mouseBlockPosX, this.mouseBlockPosY, this.mouseBlockPosZ) }
    /** @returns {string} 鼠标所在维度 */
    get mouseBlockDim() { return this.target.get('mouseBlockDim') }
    /** @returns {number} 相机中心世界 X 坐标 */
    get cameraX() { return this.target.get('cameraX') }
    /** @returns {number} 相机中心世界 Z 坐标 */
    get cameraZ() { return this.target.get('cameraZ') }

    /** @returns {number} 每世界方块对应的屏幕像素 */
    scale() { return this.mapScale / Hud.getScaleFactor() }
    /**
     * 世界长度 → 屏幕像素
     * @param {number} [length=1]
     * @returns {number}
     */
    toSize(length = 1) { return length * this.scale() }
    /**
     * 世界 X → 屏幕 X
     * @param {number} x
     * @returns {number}
     */
    toX(x) { return Math.round(this.width / 2 + this.toSize(x - this.cameraX)) }
    /**
     * 世界 Z → 屏幕 Y
     * @param {number} y
     * @returns {number}
     */
    toY(y) { return Math.round(this.height / 2 + this.toSize(y - this.cameraZ)) }
    /**
     * 世界长度 → 屏幕整数像素
     * @param {number} [length=1]
     * @returns {number}
     */
    toLength(length = 1) { return Math.round(this.toSize(length)) }
    /** @returns {number} 鼠标屏幕 X */
    mouseX() { return this.toX(this.mouseBlockPosX) }
    /** @returns {number} 鼠标屏幕 Y */
    mouseY() { return this.toY(this.mouseBlockPosZ) }
    /**
     * 屏幕坐标是否在屏幕内
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    isInBounds(x, y) { return x > 0 && y > 0 && x < this.width && y < this.height }
}

/** 事件 */
class Event {
    /** @constant @type {number} 判定属于拖拽的鼠标最短拖拽距离 */
    static DRAG_LIMIT = 1
    /** @constant @type {number} 判定属于拖拽的鼠标最短拖拽距离 */
    static DBCLICK_INTERVAL = 300
    /** @constant @type {Key} 左键 */
    static LEFTCLICK = 'key.mouse.left'
    /** @constant @type {Key} 右键 */
    static RIGHTCLICK = 'key.mouse.right'
    /** @constant @type {Key} 中键 */
    static MIDCLICK = 'key.mouse.middle'
    /** @constant @type {Key} 左 Shift */
    static SHIFT = 'key.keyboard.left.shift'
    /** @constant @type {Key} H 键 */
    static KEY_H = 'key.keyboard.h'

    /** @type {Record<Key,eventCache>} */
    static cache = {}
    /** @type {Key[]} 最近按键 */
    static latest = []
    /**
     * 更新缓存
     * @param {Key} key
     * @param {eventCache} props
     */
    static update(key, props) { Event.cache[key] = { ...Event.cache[key], ...props } }

    constructor() {
        /** @type {number} 时间戳 */
        this.timestamp = Date.now()
        /** @type {type_pos2d} 鼠标坐标 */
        this.mouse = PositionCommon.createPos(Hud.getMouseX(), Hud.getMouseY())
        /** @type {Key[]} 本次按键 */
        this.keys = Array.from(KeyBind.getPressedKeys())
        /** @type {Record<Key,{state:enum_keyState,cache:eventCache}>} 按键状态 */
        this.keyStates = {}
        /** @type {boolean} 消费标记 */
        this.consumed = false
        let latest = [...Event.latest]
        let all_keys = new Set(this.keys.concat(latest))
        for (let key of all_keys) {
            let isPressed = this.keys.includes(key)
            let wasPressed = latest.includes(key)
            if (isPressed) {
                if (wasPressed) {
                    this.keyStates[key] = { state: 'holding', cache: Event.cache[key] }
                } else {
                    let cache = Event.cache[key]
                    Event.cache[key] = {
                        timestamp: this.timestamp,
                        interval: cache ? this.timestamp - cache.timestamp : -1,
                        mouse: this.mouse
                    }
                    this.keyStates[key] = { state: 'pressed', cache: Event.cache[key] }
                }
            } else {
                if (wasPressed)
                    this.keyStates[key] = { state: 'released', cache: Event.cache[key] }
            }
        }
        Event.latest = [...this.keys]
    }
    /**
     * 获取拖拽向量
     * @param {Key} button 拖拽按键，默认左键
     * @returns {type_vec2d|null}
     */
    drag(button = Event.LEFTCLICK) {
        let kv = this.keyStates[button]
        if (kv && kv.state == 'holding') {
            let vec = kv.cache.mouse.toReverseVector(this.mouse)
            if (vec.getMagnitude() > Event.DRAG_LIMIT) return vec
        }
        return null
    }
    /**
     * 触发单击
     * @param {Key} button 触发按键，默认左键
     * @returns {boolean}
     */
    click(button = Event.LEFTCLICK) {
        return this.keyStates[button]?.state == 'pressed'
    }
    /**
     * 触发双击
     * @param {Key} button 触发按键，默认左键
     * @returns {boolean}
     */
    dbclick(button = Event.LEFTCLICK) {
        let kv = this.keyStates[button]
        return kv?.state == 'pressed'
            && kv.cache?.interval > 0
            && kv.cache?.interval <= Event.DBCLICK_INTERVAL
    }
    /** 停止事件 */
    stopPropagation() { this.consumed = true }
}

/** 事件池 */
class EventBus {
    constructor() {
        /** @type {any|null} JsMacros Tick 监听 id */
        this.tick = null
        /** @type {Record<string, {handle:handle_eventCallback, clickTimer?:number}>} tick事件池 */
        this.events = {}
    }
    /** 生成事件监听ID @returns {string} */
    static uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            let r = (Math.random() * 16) | 0
            let v = c === 'y' ? (r & 0x3) | 0x8 : r
            return v.toString(16)
        })
    }
    /** 启动 Tick 监听（每 tick 创建一个 Event 并分发给所有监听） */
    start() {
        if (this.tick) return
        this.tick = JsMacros.on('Tick', JavaWrapper.methodToJava(() => {
            let event = new Event()
            for (let key in this.events) {
                let rec = this.events[key]
                if (!rec?.handle) continue
                try {
                    if (!rec.clickTimer)
                        rec.handle(event)
                    else if (rec.clickTimer <= Date.now())
                        rec.handle(event), this.remove(key)
                } catch (e) {
                    Chat.log(`[EventBus] handler 异常: ${e}`)
                }
            }
        }))
    }
    /**
     * 注册持续监听器（每 tick 触发）
     * @param {handle_eventCallback} handle 回调
     * @returns {string} 监听ID
     */
    addListener(handle) {
        let key = `tick-${EventBus.uuid()}`
        this.events[key] = { handle: handle }
        return key
    }
    /**
     * 注册一次性定时回调（到点触发后自动移除）
     * @param {handle_eventCallback} handle 回调
     * @param {number} delay 延迟毫秒
     * @returns {string} 监听ID
     */
    setTimeout(handle, delay) {
        let key = `once-${EventBus.uuid()}`
        this.events[key] = { handle: handle, clickTimer: Date.now() + delay }
        return key
    }
    /** 移除监听 @param {string|null} key 监听ID */
    remove(key) {
        if (key)
            if (key in this.events)
                delete this.events[key]
    }
    /** 停止Tick监听并清空所有事件 */
    stop() {
        if (this.tick)
            JsMacros.off(this.tick), this.tick = null
        this.events = {}
    }
}

/** 进度查询 */
class DCAdvancement {
    constructor() { this.map = {} }

    loads() {
        for (let v of Player.getPlayer().getAdvancementManager().getAdvancementsForIdentifiers().keySet())
            if (v.startsWith('deceasedcraft:'))
                this.map[v.replace(/\:.*\//, ':')] = v
    }

    isDone(buildid) {
        let id = this.map[`${buildid}`.split('/')[0]]
        return id && Player.getPlayer().getAdvancementManager().getAdvancementProgress(id).isDone()
    }
}

/** @typedef {{color:number, texture:CustomImage|null}} MarkerStateDef 标记状态定义 */
/** 标记状态（附带纹理初始化） */
const MarkerState = {
    /** 未注册 + 未去过（红） */
    UNREGISTERED_UNVISITED: { color: 0xFF4444, texture: null },
    /** 未注册 + 已去过（橙） */
    UNREGISTERED_VISITED: { color: 0xFF8844, texture: null },
    /** 已注册 + 未去过（黄） */
    REGISTERED_UNVISITED: { color: 0xFFFF44, texture: null },
    /** 已注册 + 已去过（绿） */
    REGISTERED_VISITED: { color: 0x44FF44, texture: null },

    /** 预创建所有标记纹理 */
    initTextures() {
        for (const [name, state] of Object.entries(this)) {
            if (typeof state !== 'object' || !('color' in state)) continue
            try {
                state.texture = Hud.createTexture(16, 16, `lostradar_marker_${name}`)
                    .setGraphicsColor(state.color).drawRect(0, 0, 15, 15).update()
            } catch (e) {
                Chat.log(`§c[雷达] 纹理创建失败 ${name}: ${e}`)
            }
        }
    }
}

/** 已去过区块存储 */
class VisitedStore {
    /** @param {string|() => string} path 存储路径 */
    constructor(path) {
        /** @type {string|() => string} */ this._path = path
        /** @type {Object<string, Object<string, number>>|null} 维度 → { 区块key: 时间戳 } */
        this.cache = null
    }

    get path() { return typeof this._path == 'function' ? this._path() : this._path }

    /** 从本地文件加载
     * @returns {Object<string, Object<string, number>>}
     */
    load() {
        if (this.cache) return this.cache
        this.cache = {}
        try {
            if (FS.exists(this.path)) {
                const raw = FS.open(this.path).read()
                if (raw && raw.length > 0) this.cache = JSON.parse(raw)
            }
        } catch (e) {
            Chat.log(`§c[雷达] 加载已去过记录失败: ${e}`)
            this.cache = {}
        }
        return this.cache
    }

    /** 保存到本地文件 */
    save() {
        if (!this.cache) return
        try {
            const dir = this.path.substring(0, this.path.lastIndexOf('/'))
            if (!FS.exists(dir)) FS.open(dir).mkdir()
            FS.open(this.path).write(JSON.stringify(this.cache, null, 4))
        } catch (e) {
            Chat.log(`§c[雷达] 保存已去过记录失败: ${e}`)
        }
    }

    /**
     * 获取某维度某区块的记录时间戳
     * @param {string} dim
     * @param {string} chunkKey "cx,cz"
     * @returns {number|null}
     */
    getTime(dim, chunkKey) {
        return this.load()[dim]?.[chunkKey] ?? null
    }

    /**
     * 切换某维度某区块的已去过状态
     * @param {string} dim
     * @param {string} chunkKey
     * @returns {boolean} 切换后的状态
     */
    toggle(dim, chunkKey) {
        const cache = this.load()
        if (!cache[dim]) cache[dim] = {}

        let now
        if (cache[dim][chunkKey] !== undefined) {
            delete cache[dim][chunkKey]
            now = false
        } else {
            cache[dim][chunkKey] = Date.now()
            now = true
        }
        this.save()
        return now
    }
}

/** 雷达标记：管理光标周边区块的注册状态渲染 */
class RadarMarker {
    /**
     * @param {Draw2DUtils} d2d 渲染画布
     * @param {DCAdvancement} adv 进度查询
     * @param {VisitedStore} store 已去过存储
     */
    constructor(d2d, adv, store) {
        /** @type {Draw2DUtils} */ this.d2d = d2d
        /** @type {DCAdvancement} */ this.adv = adv
        /** @type {VisitedStore} */ this.store = store
        /** @type {Map<string, {cx:number,cz:number,image:any}>} 区块key → 标记 */
        this.markers = new Map()
        /** @type {boolean} 渲染开关 */
        this.enabled = GlobalVars.getBoolean(`${scriptName}:Hightlight`)
    }

    /** 清空所有标记 */
    clear() {
        for (const m of this.markers.values())
            this.d2d.target.removeElement(m.image)
        this.markers.clear()
    }

    /**
     * 判断某区块的标记状态
     * @param {mcjty.lostradar.data.MapPalette$PaletteEntry} entry
     * @param {number} cx
     * @param {number} cz
     * @param {string} dim
     * @returns {MarkerStateDef|null} MarkerState 之一；null=不显示
     */
    stateOf(entry, cx, cz, dim) {
        const buildings = Array.from(entry.buildings())
        if (buildings.length === 0) return null
        const registered = this.adv.isDone(buildings[0])
        const visited = this.store.getTime(dim, `${cx},${cz}`) != null
        if (registered && visited) return MarkerState.REGISTERED_VISITED
        if (registered && !visited) return MarkerState.REGISTERED_UNVISITED
        if (!registered && visited) return MarkerState.UNREGISTERED_VISITED
        return MarkerState.UNREGISTERED_UNVISITED
    }

    /**
     * 重建周边标记（只在光标换区块或状态变化时调用）
     * @param {number} ccx 中心区块 X
     * @param {number} ccz 中心区块 Z
     * @param {string} dim
     */
    rebuild(ccx, ccz, dim) {
        this.clear()
        if (!this.enabled) return
        const level = getClientLevel()
        for (let dx = -MARKER_RADIUS; dx <= MARKER_RADIUS; dx++) {
            for (let dz = -MARKER_RADIUS; dz <= MARKER_RADIUS; dz++) {
                const cx = ccx + dx
                const cz = ccz + dz
                let entry = null
                try {
                    entry = ClientMapData.getPaletteEntry(level, new ChunkPos(cx, cz))
                } catch (e) { /* 忽略 */ }
                if (!entry) continue

                const state = this.stateOf(entry, cx, cz, dim)
                if (state == null || !state.texture) continue

                const image = this.d2d.target.imageBuilder()
                    .fromCustomImage(state.texture).alpha(200).size(14, 14)
                    .build()
                this.d2d.target.reAddElement(image)
                this.markers.set(`${cx},${cz}`, { cx, cz, image })
            }
        }
    }

    /**
     * 每 tick 更新标记屏幕坐标
     * @param {GuiMap} guimap
     */
    update(guimap) {
        if (!this.enabled || this.markers.size === 0) return
        const camX = guimap.cameraX
        const camZ = guimap.cameraZ
        const scale = guimap.mapScale / Hud.getScaleFactor()
        const halfW = guimap.width / 2
        const halfH = guimap.height / 2
        const size = Math.max(2, Math.round(14 * scale))

        for (const m of this.markers.values()) {
            const x = Math.round(halfW + (m.cx * 16 + 1 - camX) * scale)
            const y = Math.round(halfH + (m.cz * 16 + 1 - camZ) * scale)
            m.image.moveTo(x, y).setSize(size, size)
        }
    }

    /** 切换开关 */
    toggle() {
        this.enabled = !this.enabled
        GlobalVars.putBoolean(`${scriptName}:Hightlight`, this.enabled)
        if (!this.enabled) this.clear()
        return this.enabled
    }
}

/** tooltip 构建器 */
class RadarTooltip {
    /**
     * @param {DCAdvancement} adv
     * @param {VisitedStore} store
     */
    constructor(adv, store) {
        /** @type {DCAdvancement} */ this.adv = adv
        /** @type {VisitedStore} */ this.store = store
    }

    /**
     * 构建带雷达数据的 tooltip
     * @param {mcjty.lostradar.data.MapPalette$PaletteEntry} entry
     * @param {number} cx
     * @param {number} cz
     * @param {string} dim
     * @returns {string[]}
     */
    build(entry, cx, cz, dim) {
        /** @type {string[]} */
        const lines = []
        const buildings = Array.from(entry.buildings())
        if (buildings.length === 0) return lines

        let name = entry.name()
        const localized = Chat.createTextHelperFromTranslationKey(entry.translatableKey()).getString().trim()
        if (localized && localized !== entry.translatableKey()) name = localized

        lines.push(`§e${name} §7(${entry.name()})`)
        lines.push(`§7区块: §f${cx}, ${cz}`)

        const registered = this.adv.isDone(buildings[0])
        const visited = this.store.getTime(dim, `${cx},${cz}`) != null
        lines.push(`§7收集: ${registered ? '§a已注册' : '§c未注册'}`)
        lines.push(`§7去过: ${visited ? '§a已去过' : '§c未去过'}`)

        lines.push(visited ? `§8Shift+左键 取消标记` : `§8Shift+左键 标记去过`)
        // for (let i of buildings) lines.push(`${i}`)
        return lines
    }

    /**
     * 构建无雷达数据但已去过的简化 tooltip
     * @param {number} cx
     * @param {number} cz
     * @param {number} visitedTime 时间戳
     * @returns {string[]}
     */
    buildVisitedOnly(cx, cz, visitedTime) {
        const timeStr = new Date(visitedTime).toLocaleString()
        return [
            `§a✔ 已去过 §7(${timeStr})`,
            `§7区块: §f${cx}, ${cz}`,
            `§8Shift+左键 取消标记`,
        ]
    }
}

// ==================== 全局实例 ====================

const bus = new EventBus()
const adv = new DCAdvancement()
const visitedStore = new VisitedStore(VISITED_PATH)
const radarTooltip = new RadarTooltip(adv, visitedStore)

// 预创建所有标记纹理
MarkerState.initTextures()

// ==================== 主逻辑 ====================

/** @type {any|null} OpenScreen 监听 id */
let screen_listener = null
/** @type {string|null} filter_listener 监听 id */
let filter_listener = null
/** @type {string|null} 上次记录的玩家所在区块 key（自动记录用） */
let last_player_key = null

function main() {
    screen_listener = JsMacros.on('OpenScreen', JavaWrapper.methodToJava(() => {
        const screen = Hud.getOpenScreen()
        bus.remove(filter_listener)

        if (screen && Reflection.getClassName(screen) == 'xaero.map.gui.GuiMap') {
            adv.loads()
            const guimap = new GuiMap(screen)
            const region = { x: 0, y: 0, width: 0, height: 0 }
            Client.runOnMainThread(JavaWrapper.methodToJava(() => {
                region.width = guimap.width
                region.height = guimap.height
            }), true, 1000)

            const radar_d2d = new Draw2DUtils(region)
            screen.addDraw2D(radar_d2d.target, region.x, region.y, region.width, region.height)

            const marker = new RadarMarker(radar_d2d, adv, visitedStore)

            /** @type {string|null} 上次查询的区块 key */
            let last_key = null
            /** @type {mcjty.lostradar.data.MapPalette$PaletteEntry|null} 缓存条目 */
            let last_entry = null
            let tick_counter = 0

            filter_listener = bus.addListener(event => {
                const pressedKeys = event.keys
                tick_counter++
                if (pressedKeys.length == 0 && tick_counter % 5 !== 0) return
                tick_counter = 0

                radar_d2d.tooltips = []

                // 读鼠标区块
                const mx = guimap.mouseBlockPosX
                const mz = guimap.mouseBlockPosZ
                const cx = Math.floor(mx / 16)
                const cz = Math.floor(mz / 16)
                const key = `${cx},${cz}`
                const dim = World.getDimension()

                // ---- H 键：切换标记渲染 ----
                if (event.click(Event.KEY_H)) {
                    const on = marker.toggle()
                    mclog(on ? '标记渲染 §a开启' : '标记渲染 §c关闭')
                    if (on) marker.rebuild(cx, cz, dim)
                }

                // ---- Shift+左键：切换已去过状态，立即重建标记 ----
                if (event.click(Event.LEFTCLICK) && pressedKeys.includes(Event.SHIFT)) {
                    // 用当前鼠标区块的 entry 做扩展依据
                    let centerEntry = last_entry
                    if (!centerEntry) {
                        try {
                            centerEntry = ClientMapData.getPaletteEntry(getClientLevel(), new ChunkPos(cx, cz))
                        } catch (e) { /* 忽略 */ }
                    }

                    if (centerEntry && Array.from(centerEntry.buildings() ?? []).length > 0) {
                        const cluster = expandSameName(cx, cz, dim, centerEntry)
                        const allVisited = cluster.every(k => visitedStore.getTime(dim, k) != null)
                        const targetState = !allVisited
                        for (const k of cluster) {
                            const has = visitedStore.getTime(dim, k) != null
                            if (targetState !== has) visitedStore.toggle(dim, k)
                        }
                        mclog(targetState
                            ? `已标记 §a${cluster.length} §7个区块`
                            : `已取消 §c${cluster.length} §7个区块`)
                    } else {
                        const now = visitedStore.toggle(dim, key)
                        mclog(now ? `已标记 §a${key}` : `已取消 §c${key}`)
                    }

                    last_key = null
                    marker.rebuild(cx, cz, dim)
                } else if (key !== last_key) {
                    marker.rebuild(cx, cz, dim)
                }

                marker.update(guimap)
                // ---- 鼠标换区块才重新查询 ----
                if (key !== last_key) {
                    last_key = key
                    try {
                        last_entry = ClientMapData.getPaletteEntry(getClientLevel(), new ChunkPos(cx, cz))
                    } catch (e) {
                        last_entry = null
                    }
                }

                if (last_entry) {
                    radar_d2d.tooltips = radarTooltip.build(last_entry, cx, cz, dim)
                } else {
                    const visitedTime = visitedStore.getTime(dim, key)
                    if (visitedTime != null)
                        radar_d2d.tooltips = radarTooltip.buildVisitedOnly(cx, cz, visitedTime)
                }
            })
        }
    }))
}

try {
    JsMacros.assertEvent(event, "Service")
    setToggle(true)
    event.stopListener = JavaWrapper.methodToJava(() => setToggle(false))
} catch {
    setToggle(!isToggle())
}

if (isToggle()) {
    bus.start()
    main()

    while (isToggle()) {
        // ---- 自动记录玩家停留过的有建筑区块（独立于地图打开状态） ----
        let playerKey = getPlayerChunkKey()
        if (playerKey != null && playerKey !== last_player_key) {
            last_player_key = playerKey
            const dim = World.getDimension()
            const parts = playerKey.split(',')
            const pcx = parseInt(parts[0], 10)
            const pcz = parseInt(parts[1], 10)

            let entry = ClientMapData.getPaletteEntry(
                getClientLevel(),
                new ChunkPos(pcx, pcz)
            )
            if (entry) {
                let buildings = Array.from(entry.buildings())
                if (buildings.length > 0) {
                    // 扩展同名建筑，一同标记
                    const cluster = expandSameName(pcx, pcz, dim, entry)
                    let added = 0
                    for (const k of cluster) {
                        if (visitedStore.getTime(dim, k) == null) {
                            visitedStore.toggle(dim, k)
                            added++
                        }
                    }
                    if (added > 0)
                        Chat.actionbar(`添加记录 §a${added} §7个区块`)

                    adv.loads()
                    if (!adv.isDone(buildings[0]))
                        mclog('此建筑尚未注册')
                }
            }
        }

        Client.waitTick(5)
    }
}

bus?.stop()
Hud?.clearDraw2Ds()
if (screen_listener)
    JsMacros.off(screen_listener)
