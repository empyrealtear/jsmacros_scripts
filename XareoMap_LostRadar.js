// 脚本名称: 失落城市雷达数据
// 功能介绍: 在Xaero世界地图上显示失落城市雷达数据（鼠标悬停区块显示tooltip，Shift+左键标记已去过，自动记录有建筑的区块）
// 依赖模组: jsmacros、Xaero地图(Xaero's World Map)、失落城市雷达(LostRadar)
// 更新内容: v1.0 初始化脚本
// 更新内容: v1.1 自动记录停留过的建筑区块，允许添加为常驻服务脚本，修复未正确获取维度名

const scriptName = 'XareoMap_LostRadar.ToggleScript'
/** 已去过区块的存储路径 */
const VISITED_PATH = 'lostradar_visited.json'

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

/** @type {mcjty.lostradar.data.ClientMapData} @link {https://github.com/McJtyMods/LostRadar} */
const ClientMapData = Java.type('mcjty.lostradar.data.ClientMapData').getData()
/** @type {JavaClass<ChunkPos>} */
const ChunkPos = Java.type('net.minecraft.world.level.ChunkPos')

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
                onrender && onrender(...args)
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

/** @returns {ClientLevel} 主世界 ClientLevel */
function getClientLevel() {
    const mc = Client.getMinecraft()
    return new DeobfRef(mc).get('level', 'field_1687', 'world', 'f_91073_')
}

/** 事件 */
class Event {
    /** @type {net.minecraft.client.input.KeyEvent} */
    static KeyEvent = DeobfRef.Type(
        'net.minecraft.client.input.KeyEvent', 'net.minecraft.class_11908',
        'net.minecraft.client.input.KeyInput', 'net.minecraft.src.C_411099_'
    )
    /** @type {net.minecraft.client.input.CharacterEvent} */
    static CharacterEvent = DeobfRef.Type(
        'net.minecraft.client.input.CharacterEvent', 'net.minecraft.class_11905',
        'net.minecraft.client.input.CharInput', 'net.minecraft.src.C_411367_'
    )
    /** @type {net.minecraft.client.input.MouseButtonEvent} */
    static MouseButtonEvent = DeobfRef.Type(
        'net.minecraft.client.input.MouseButtonEvent', 'net.minecraft.class_11909',
        'net.minecraft.client.gui.Click', 'net.minecraft.src.C_410856_'
    )
    /** @type {net.minecraft.client.input.MouseButtonInfo} */
    static MouseButtonInfo = DeobfRef.Type(
        'net.minecraft.client.input.MouseButtonInfo', 'net.minecraft.class_11910',
        'net.minecraft.client.input.MouseInput', 'net.minecraft.src.C_411057_'
    )

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

// ==================== 已去过区块存储 ====================

/**
 * 已去过记录的内存缓存
 * @type {Object<string, Object<string, number>>|null} 维度 → { 区块key: 时间戳 }
 */
let visited_cache = null

/**
 * 从本地文件加载已去过记录
 * @returns {Object<string, Object<string, number>>}
 */
function loadVisited() {
    if (visited_cache) return visited_cache
    visited_cache = {}
    try {
        if (FS.exists(VISITED_PATH)) {
            const raw = FS.open(VISITED_PATH).read()
            if (raw && raw.length > 0) {
                visited_cache = JSON.parse(raw)
            }
        }
    } catch (e) {
        Chat.log(`§c[雷达] 加载已去过记录失败: ${e}`)
        visited_cache = {}
    }
    return visited_cache
}

/**
 * 保存已去过记录到本地文件
 */
function saveVisited() {
    if (!visited_cache) return
    try {
        const dir = VISITED_PATH.substring(0, VISITED_PATH.lastIndexOf('/'))
        if (!FS.exists(dir)) FS.open(dir).mkdir()
        FS.open(VISITED_PATH).write(JSON.stringify(visited_cache, null, 4))
    } catch (e) {
        Chat.log(`§c[雷达] 保存已去过记录失败: ${e}`)
    }
}

/**
 * 获取某维度某区块的记录时间戳
 * @param {string} dim 维度 id
 * @param {string} chunkKey "cx,cz"
 * @returns {number|null} 时间戳；未记录返回 null
 */
function getVisitedTime(dim, chunkKey) {
    const cache = loadVisited()
    return cache[dim]?.[chunkKey] ?? null
}

/**
 * 切换某维度某区块的已去过状态
 * @param {string} dim 维度 id
 * @param {string} chunkKey "cx,cz"
 * @returns {boolean} 切换后的状态（true=已记录）
 */
function toggleVisited(dim, chunkKey) {
    const cache = loadVisited()
    if (!cache[dim]) cache[dim] = {}

    let now
    if (cache[dim][chunkKey] !== undefined) {
        delete cache[dim][chunkKey]
        now = false
    } else {
        cache[dim][chunkKey] = Date.now()
        now = true
    }
    saveVisited()
    return now
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
 * 把 PaletteEntry + 区块坐标 格式化为 tooltip 行
 * @param {mcjty.lostradar.data.MapPalette$PaletteEntry} entry
 * @param {number} cx
 * @param {number} cz
 * @param {string} dim 维度 id
 * @returns {string[]}
 */
function buildRadarTooltip(entry, cx, cz, dim) {
    /** @type {string[]} */
    const lines = []

    // 本地化名称
    let name = entry.name()
    let localized = Chat.createTextHelperFromTranslationKey(entry.translatableKey()).getString().trim()
    if (localized && localized !== entry.translatableKey())
        name = localized

    lines.push(`§e${name} §7(${entry.name()})`)
    lines.push(`§7区块: §f${cx}, ${cz}`)
    // lines.push(`§7方块: §f${cx * 16}, ${cz * 16}`)
    // lines.push(`§7颜色: §f#${entry.color().toString(16).padStart(6, '0')}`)
    lines.push(`§7扫描消耗: §f${entry.usage()}`)

    // ---- 已去过标记 ----
    const visitedTime = getVisitedTime(dim, `${cx},${cz}`)
    if (visitedTime != null) {
        const timeStr = new Date(visitedTime).toLocaleString()
        lines.push(`§a✔ 已去过 §7(${timeStr}) §8Shift+左键取消`)
    } else {
        lines.push(`§7Shift+左键标记为已去过`)
    }

    // const buildings = Array.from(entry.buildings())
    // if (buildings.length > 0) {
    //     lines.push(`§7建筑:`)
    //     const max = 8
    //     for (let i = 0; i < Math.min(buildings.length, max); i++) {
    //         lines.push(`§8  - §f${buildings[i]}`)
    //     }
    //     if (buildings.length > max) {
    //         lines.push(`§8  ... 还有 ${buildings.length - max} 个`)
    //     }
    // }

    return lines
}

/** @type {any|null} OpenScreen 监听 id */
let screen_listener = null
function main() {
    screen_listener = JsMacros.on('OpenScreen', JavaWrapper.methodToJava(() => {
        const screen = Hud.getOpenScreen()
        bus.remove(filter_listener)
        if (screen && Reflection.getClassName(screen) == 'xaero.map.gui.GuiMap') {

            const guimap = new GuiMap(screen)
            const region = { x: 0, y: 0, width: 0, height: 0 }
            Client.runOnMainThread(JavaWrapper.methodToJava(() => {
                region.width = guimap.width
                region.height = guimap.height
            }), true, 1000)

            const radar_d2d = new Draw2DUtils(region)
            screen.addDraw2D(radar_d2d.target, region.x, region.y, region.width, region.height)

            /** @type {string|null} 上次查询的区块 key */
            let last_key = null
            /** @type {mcjty.lostradar.data.MapPalette$PaletteEntry|null} 缓存条目 */
            let last_entry = null

            filter_listener = bus.addListener(event => {
                // 每 tick 清空 tooltip
                radar_d2d.tooltips = []

                // 读鼠标区块
                const mx = guimap.mouseBlockPosX
                const mz = guimap.mouseBlockPosZ
                const cx = Math.floor(mx / 16)
                const cz = Math.floor(mz / 16)
                const key = `${cx},${cz}`
                const dim = World.getDimension()

                // ---- Shift+左键：切换已去过状态 ----
                if (event.click(Event.LEFTCLICK) && event.keys.includes(Event.SHIFT)) {
                    const now = toggleVisited(dim, key)
                    mclog(now ? `已标记 §a${key} §7(已去过)` : `已取消标记 §c${key}`)
                    last_key = null   // 强制下一 tick 重新构建 tooltip
                }

                // 鼠标换区块才重新查询
                if (key !== last_key) {
                    last_key = key
                    try {
                        last_entry = ClientMapData.getPaletteEntry(
                            getClientLevel(),
                            new ChunkPos(cx, cz)
                        )
                    } catch (e) {
                        last_entry = null
                    }
                }

                if (last_entry) {
                    radar_d2d.tooltips = buildRadarTooltip(last_entry, cx, cz, dim)
                } else {
                    const visitedTime = getVisitedTime(dim, key)
                    if (visitedTime != null) {
                        const timeStr = new Date(visitedTime).toLocaleString()
                        radar_d2d.tooltips = [
                            `§a✔ 已去过 §7(${timeStr})`,
                            `§7区块: §f${cx}, ${cz}`,
                            // `§7方块: §f${cx * 16}, ${cz * 16}`,
                            `§8Shift+左键取消标记`,
                        ]
                    }
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

const bus = new EventBus()
/** @type {string|null} filter_listener 监听 id */
let filter_listener = null
/** @type {string|null} 上次记录的玩家所在区块 key（自动记录用） */
let last_player_key = null

if (isToggle()) {
    bus.start()
    main()
    while (isToggle()) {
        // ---- 自动记录玩家停留过的有建筑区块（独立于地图打开状态） ----
        const playerKey = getPlayerChunkKey()
        if (playerKey != null && playerKey !== last_player_key) {
            last_player_key = playerKey
            const dim = World.getDimension()
            // 尚未记录时才检查
            if (getVisitedTime(dim, playerKey) == null) {
                let shouldRecord = false
                const parts = playerKey.split(',')
                const entry = ClientMapData.getPaletteEntry(
                    getClientLevel(),
                    new ChunkPos(parseInt(parts[0], 10), parseInt(parts[1], 10))
                )
                if (entry != null) {
                    const buildings = Array.from(entry.buildings())
                    shouldRecord = buildings.length > 0
                }

                if (shouldRecord) {
                    toggleVisited(dim, playerKey)
                    Chat.actionbar(`添加记录 §a${playerKey}`)
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
