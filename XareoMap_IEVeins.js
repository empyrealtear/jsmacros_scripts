// 脚本名称: 沉浸工程矿脉预览
// 功能介绍: 在Xaero世界地图上显示沉浸工程矿脉
// 依赖模组: jsmacros、Xaero地图(Xaero's World Map)、沉浸工程(Immersive Engineering)

const scriptName = 'XareoMap_IEVeins.ToggleScript'
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
setToggle(!isToggle())

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
 * 
 * @typedef {Object} VeinEntry
 * @property {number} x 中心方块 X
 * @property {number} z 中心方块 Z
 * @property {number} radius 半径（方块）
 * @property {string} mineral 矿物名（plainName）
 * @property {number} depletion 已开采量
 * 
 * @typedef {Object} MineralInfo
 * @property {string} key 翻译键
 * @property {string} name plainName
 * @property {string} transName 本地化名称
 * @property {string} background 背景方块 id
 * @property {string[]} dimensions 出现的维度
 * @property {number} weight 权重
 * @property {number} failChance 失败率
 * @property {{stack:string, chance:number}[]} outputs 产出列表
 * @property {{stack:string, chance:number}[]} spoils 废料列表
 * 
 * @typedef {Object} ReadVeinsResult
 * @property {Object<string, VeinEntry[]>} veins 按维度分组的矿脉
 * @property {number} total 矿脉总数
 * @property {List<RecipeHolder<R>>} map 配方集合
 */

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

/** 
 * @typedef {{x:int,y:int,width:int,height:int}} Region 显示区域
 * Draw2D拓展：支持裁剪画布+渲染提示框 
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

/** @type {any|null} OpenScreen 监听 id */
let screen_listener = null

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

/** @type {JavaClass<ExcavatorHandler>} */
const ExcavatorHandler = Java.type('blusunrize.immersiveengineering.api.excavator.ExcavatorHandler')
/** @type {JavaClass<MineralMix>} */
const MineralMix = Java.type('blusunrize.immersiveengineering.api.excavator.MineralMix')

/** @returns {ServerLevel} 主世界 ServerLevel */
function getServerLevel() {
    const mc = Client.getMinecraft()
    const server = Reflection.getClass('net.minecraft.client.Minecraft')
        .getDeclaredMethod('m_91092_').invoke(mc)
    return Reflection.getClass('net.minecraft.server.MinecraftServer')
        .getDeclaredMethod('m_129783_').invoke(server)
}

/** @returns {ClientLevel} 主世界 ClientLevel */
function getClientLevel() {
    const mc = Client.getMinecraft()
    return new DeobfRef(mc).get('level', 'field_1687', 'world', 'f_91073_')
}

/**
 * 列出矿物配方
 * @param {Level} level
 * @returns {List<RecipeHolder<R>>} 配方集合
 */
function listMineralRecipes(level) {
    const RECIPES = MineralMix?.RECIPES
    if (RECIPES)
        return RECIPES.getRecipes(level)
    return null
}

/**
 * 读取当前世界所有矿脉
 * @returns {ReadVeinsResult}
 */
function readVeins() {
    const level = getClientLevel()
    const veinList = ExcavatorHandler.getMineralVeinList()
    const veins = {}
    let total = 0

    const keys = veinList.keySet().iterator()
    while (keys.hasNext()) {
        const key = keys.next()
        const dim = `${new DeobfRef(key).get('location', 'field_25138', 'value', 'f_135777_')}`
        const arr = []
        const it = veinList.get(key).iterator()
        while (it.hasNext()) {
            const v = it.next()
            const pos = v.getPos()
            const mineral = v.getMineral(level)
            arr.push({
                x: pos.f_140723_(),
                z: pos.f_140724_(),
                radius: v.getRadius(),
                mineral: mineral.getPlainName(),
                depletion: v.getDepletion()
            })
        }
        veins[dim] = arr
        total += arr.length
    }
    return { veins, total, map: listMineralRecipes(level) }
}

/**
 * 把配方列表转成 {plainName: {...}} 映射
 * @param {List<RecipeHolder<R>>} recipes
 * @returns {Object<string, MineralInfo>}
 */
function readMineralMap(recipes) {
    const mineral_map = {}
    recipes.forEach(v => {
        let name = v.getPlainName()
        let key = v.getTranslationKey()
        mineral_map[name] = {
            key: key,
            name: name,
            transName: Chat.createTextHelperFromTranslationKey(key).getString().trim(),
            background: `${JavaUtils.getHelperFromRaw(v.background).getId()}`,
            dimensions: Array.from(v.dimensions).map(d =>
                `${new DeobfRef(d).get('location', 'field_25138', 'value', 'f_135777_')}`),
            weight: v.weight,
            failChance: v.failChance,
            outputs: Array.from(v.outputs).map(o => ({
                stack: JavaUtils.getHelperFromRaw(o.stack().get()).getItemId(),
                chance: o.chance()
            })),
            spoils: Array.from(v.spoils).map(s => ({
                stack: JavaUtils.getHelperFromRaw(s.stack().get()).getItemId(),
                chance: s.chance()
            })),
        }
    })
    return mineral_map
}

/** 矿脉标记 */
class IeMineral {
    /** @type {Object<string, MineralInfo & {texture:{icon:string,color:number,circle:CustomImage}, visiable:boolean}} */
    static MINERAL_MAP = {
        none: {
            texture: {
                icon: 'minecraft:stone',
                color: 0xFFFFFF,
                circle: Hud.createTexture(64, 64, 'ie_mineral_canvas_none').update()
            }
        }
    }
    /** @type {number} 单矿脉最大储量 */
    static MAX = 38400

    /**
     * 初始化矿物配方与纹理
     * @param {Object<string, MineralInfo>} recipes
     * @param {number} maxYield 单矿脉最大储量
     */
    static init(recipes, maxYield) {
        Object.entries(recipes).forEach(([key, info], i) => {
            let texture = IeMineral.MINERAL_MAP[key]?.texture
            if (!texture) {
                let color = (((i * 137) % 360) << 16) | (((i * 73) % 255) << 8) | ((i * 41) % 255)
                let radius = 512
                let d = 8
                texture = {
                    icon: info.outputs.sort((a, b) => b.chance - a.chance)[0].stack,
                    color: color,
                    circle: Hud.createTexture(radius, radius, `ie_mineral_canvas_${key}`)
                        .setGraphicsColor(color)
                        .fillOval(0, 0, radius - 1, radius - 1)
                        .setGraphicsColor(0x121212)
                        .fillOval(d, d, radius - 1 - d * 2, radius - 1 - d * 2)
                        .update()
                }
            }
            IeMineral.MINERAL_MAP[key] = Object.assign({}, info, { texture, visiable: false })
        })
        IeMineral.MAX = maxYield
    }

    /**
     * @param {GuiMap} map
     * @param {IDraw2D} overlay
     * @param {VeinEntry} opts
     */
    constructor(map, overlay, opts) {
        /** @type {GuiMap} 地图 */ this.map = map
        /** @type {IDraw2D} 地图 */ this.overlay = overlay
        /** @type {int} 矿脉中心坐标 */ this.x = opts.x
        /** @type {int} 矿脉中心坐标 */ this.z = opts.z
        /** @type {int} 矿脉半径 */ this.radius = opts.radius
        /** @type {string} 矿脉名称 */ this.mineral = opts.mineral
        /** @type {int} 已开采量 */ this.depletion = opts.depletion
        /** @type {string} 主产物id */ this.icon = IeMineral.MINERAL_MAP[this.mineral].texture?.icon
            ?? IeMineral.MINERAL_MAP.none.texture.icon
        /** @type {number} 控件配色 */ this.color = IeMineral.MINERAL_MAP[this.mineral].texture?.color
            ?? IeMineral.MINERAL_MAP.none.texture.color
        /** @type {CustomImage} 控件配色 */ this.circle = IeMineral.MINERAL_MAP[this.mineral].texture?.circle
            ?? IeMineral.MINERAL_MAP.none.texture.circle

        /** @type {boolean} @private 是否可见 */ this._visiable = false

        /** @type {{center:Item,range:Image}} 控件 */
        this.widgets = {}
        this.create()
    }

    /** @returns {boolean} */
    get visiable() { return this._visiable }
    /** @param {boolean} value */
    set visiable(value) {
        if (value == this._visiable) return
        for (let key of Object.keys(this.widgets)) {
            if (value)
                this.overlay.reAddElement(this.widgets[key])
            else
                this.overlay.removeElement(this.widgets[key])
        }
        this._visiable = value
    }

    /** @returns {string[]} 提示框内容 */
    get details() {
        let mineral = IeMineral.MINERAL_MAP[this.mineral]
        if (!mineral) return [`未知矿脉: ${this.mineral}`]
        let register = Client.getRegistryManager()
        let handle = v => `${register.getItem(v.stack).getName()}(${Math.round(v.chance * 100)}%)`
        return [
            `矿脉: ${mineral.transName}`,
            `中心: ${this.x}, ${this.z}`,
            `半径: ${this.radius}`,
            `储量: ${IeMineral.MAX - this.depletion} (${Math.round((1 - this.depletion / IeMineral.MAX) * 100)}%)`,
            `矿物: ${mineral.outputs.map(handle)}`,
            `废渣: ${mineral.spoils.map(handle)}`,
        ]
    }

    /** 创建绘制元素 */
    create() {
        this.widgets.center = this.overlay.itemBuilder().zIndex(0)
            .item(Client.getRegistryManager().getItemStack(this.icon, '{Enchantments:[{id:-1,lvl:-1}]}'))
            .build()
        this.widgets.range = this.overlay.imageBuilder().zIndex(0)
            .fromCustomImage(this.circle).alpha(150)
            .build()
        return this
    }

    /** 每帧更新坐标 */
    update() {
        let x = this.map.toX(this.x - 1)
        let y = this.map.toY(this.z - 1)
        this.visiable = this.map.isInBounds(x, y)
        if (this._visiable) {
            let size = Math.max(9, this.map.scale()) / 16
            this.widgets.center.moveTo(x, y).setScale(size)
            let radius = this.map.toLength(2 * this.radius)
            this.widgets.range.setSize(radius, radius)
                .align(this.widgets.center, 'CenterOnCenter', 'CenterOnCenter')
        }
    }

    /** 移除 */
    remove() {
        this.visiable = false
        this.widgets = {}
    }

    /** @returns {boolean} 鼠标是否悬停在矿脉上 */
    focus() {
        if (!this._visiable) return false
        let i = this.widgets.center
        let dx = Hud.getMouseX() - i.getX()
        let dy = Hud.getMouseY() - i.getY()
        return dx > 0 && dy > 0 && dx < 8 && dy < 8
    }
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
        let dragging = false
        let latest = 0
        let dbclick = false
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

/** 多选框 */
class MultiSelect {
    /**
     * @param {object} opts
     * @param {Record<string, boolean>} [opts.selected] 初始选中状态
     * @param {(key:string, selected:boolean)=>void} [opts.onChange] 状态变化回调
     * @param {number} [opts.x=0] 左上角 X
     * @param {number} [opts.y=0] 左上角 Y
     * @param {number} [opts.rowHeight=12] 每行高度
     * @param {number} [opts.boxSize=8] 复选框边长
     * @param {number} [opts.gap=4] 复选框与文字间距
     * @param {number} [opts.scale=0.8] 文字缩放
     * @param {number} [opts.color=0xFFFFFF] 文字颜色
     * @param {number} [opts.boxColor=0xAAAAAA] 复选框底色
     * @param {number} [opts.checkColor=0x55FF55] 勾选色
     * @param {number} [opts.buttonHeight=12] 按钮高度
     * @param {number} [opts.buttonGap=4] 按钮间距
     * @param {number} [opts.buttonPadding=4] 按钮左右内边距
     * @param {number} [opts.buttonColor=0x555555] 按钮底色
     * @param {number} [opts.buttonTextColor=0xFFFFFF] 按钮文字色
     * @param {number} [opts.panelColor=0x000000] 面板底色
     * @param {number} [opts.panelAlpha=120] 面板透明度
     * @param {number} [opts.panelPadding=6] 面板内边距
     * @param {number} [opts.screenOffsetX=0] D2D 区域屏幕 X 偏移
     * @param {number} [opts.screenOffsetY=0] D2D 区域屏幕 Y 偏移
     */
    constructor(opts = {}) {
        this.selected = Object.assign({}, opts.selected || {})
        this.keys = Object.keys(this.selected)
        this.labels = {}
        for (const k of this.keys) this.labels[k] = k

        this.x = opts.x ?? 0
        this.y = opts.y ?? 0
        this.rowHeight = opts.rowHeight ?? 12
        this.boxSize = opts.boxSize ?? 8
        this.gap = opts.gap ?? 4
        this.scale = opts.scale ?? 0.8
        this.color = opts.color ?? 0xFFFFFF
        this.boxColor = opts.boxColor ?? 0xAAAAAA
        this.checkColor = opts.checkColor ?? 0x55FF55

        this.buttonHeight = opts.buttonHeight ?? 12
        this.buttonGap = opts.buttonGap ?? 4
        this.buttonPadding = opts.buttonPadding ?? 4
        this.buttonColor = opts.buttonColor ?? 0x555555
        this.buttonTextColor = opts.buttonTextColor ?? 0xFFFFFF

        this.panelColor = opts.panelColor ?? 0x000000
        this.panelAlpha = opts.panelAlpha ?? 120
        this.panelPadding = opts.panelPadding ?? 6

        this.screenOffsetX = opts.screenOffsetX ?? 0
        this.screenOffsetY = opts.screenOffsetY ?? 0

        this.onChange = opts.onChange || null
        this.overlay = null
        this.panel = null
        this.rows = []
        this.buttons = []
        this.rendered = false
        this._contentY = this.y
        this._totalWidth = 0
    }

    /**
     * @param {string} key
     * @param {string} label
     * @returns {this}
     */
    setLabel(key, label) { this.labels[key] = label; if (this.rendered) this._syncTexts(); return this }

    /**
     * @param {Record<string, string>} map
     * @returns {this}
     */
    setLabels(map) { for (const k of Object.keys(map)) this.labels[k] = map[k]; if (this.rendered) this._syncTexts(); return this }

    /** @param {string} key @returns {boolean} */
    isSelected(key) { return !!this.selected[key] }

    /**
     * @param {string} key
     * @param {boolean} value
     * @returns {this}
     */
    setSelected(key, value) {
        if (this.selected[key] === value) return this
        this.selected[key] = value
        if (this.rendered) this._syncCheck()
        return this
    }

    /**
     * @param {string} key
     * @returns {boolean} 切换后的状态
     */
    toggle(key) {
        const v = !this.selected[key]
        this.selected[key] = v
        if (this.rendered) this._syncCheck()
        if (this.onChange) this.onChange(key, v)
        return v
    }

    /** @returns {string[]} */
    getSelectedKeys() { return Object.keys(this.selected).filter(k => this.selected[k]) }

    /** @returns {this} */
    selectAll() {
        for (const k of this.keys) {
            if (!this.selected[k]) {
                this.selected[k] = true
                if (this.onChange) this.onChange(k, true)
            }
        }
        if (this.rendered) this._syncCheck()
        return this
    }

    /** @returns {this} */
    invertAll() {
        for (const k of this.keys) {
            this.selected[k] = !this.selected[k]
            if (this.onChange) this.onChange(k, this.selected[k])
        }
        if (this.rendered) this._syncCheck()
        return this
    }

    /**
     * @param {IDraw2D} overlay
     * @returns {this}
     */
    render(overlay) {
        this.overlay = overlay

        const buttonDefs = [
            { action: 'all', label: '全选' },
            { action: 'invert', label: '反选' },
        ]

        // 按钮宽度
        let bx = this.x
        const buttonWidths = []
        for (const def of buttonDefs) {
            const t = overlay.textBuilder().text(def.label).pos(0, 0)
                .scale(this.scale).color(this.buttonTextColor).buildAndAdd()
            const w = t.getWidth() + this.buttonPadding * 2
            buttonWidths.push(w)
            overlay.removeElement(t)
            bx += w + this.buttonGap
        }
        const buttonRowWidth = bx - this.x - this.buttonGap

        // 选项行最大宽度
        let maxRowWidth = 0
        for (const key of this.keys) {
            const t = overlay.textBuilder().text(this.labels[key] ?? key).pos(0, 0)
                .scale(this.scale).color(this.color).buildAndAdd()
            maxRowWidth = Math.max(maxRowWidth, this.boxSize + this.gap + t.getWidth())
            overlay.removeElement(t)
        }

        const contentWidth = Math.max(buttonRowWidth, maxRowWidth)
        const buttonRowHeight = this.buttonHeight + 6
        this._contentY = this.y + buttonRowHeight

        const totalWidth = contentWidth + this.panelPadding * 2
        const totalHeight = buttonRowHeight + this.keys.length * this.rowHeight + this.panelPadding * 2
        this._totalWidth = totalWidth

        // 面板
        this.panel = overlay.rectBuilder()
            .color(this.panelColor).alpha(this.panelAlpha)
            .size(totalWidth, totalHeight)
            .buildAndAdd()
        this.panel.moveTo(this.x - this.panelPadding, this.y - this.panelPadding)

        // 按钮行
        bx = this.x
        for (let i = 0; i < buttonDefs.length; i++) {
            const def = buttonDefs[i]
            const w = buttonWidths[i]
            const bg = overlay.rectBuilder()
                .color(this.buttonColor).alpha(220)
                .size(w, this.buttonHeight)
                .buildAndAdd()
            const text = overlay.textBuilder()
                .text(def.label).scale(this.scale).color(this.buttonTextColor)
                .buildAndAdd()
            const tw = text.getWidth()
            const th = this.buttonHeight * this.scale
            text.moveTo(Math.round(bx + (w - tw) / 2), Math.round(this.y + (this.buttonHeight - th) / 2))
            bg.align(text, 'CenterOnCenter', 'CenterOnCenter')
            this.buttons.push({ bg, text, action: def.action, x1: bx, x2: bx + w })
            bx += w + this.buttonGap
        }

        // 选项行
        for (let i = 0; i < this.keys.length; i++) {
            const key = this.keys[i]
            const ry = this._contentY + i * this.rowHeight

            const box = overlay.rectBuilder()
                .color(this.boxColor).alpha(200)
                .size(this.boxSize, this.boxSize).buildAndAdd()
            box.moveTo(this.x, ry)

            const check = overlay.rectBuilder()
                .color(this.checkColor).alpha(this.selected[key] ? 255 : 0)
                .size(this.boxSize - 2, this.boxSize - 2).buildAndAdd()
            check.moveTo(this.x + 1, ry + 1)

            const text = overlay.textBuilder()
                .text(this.labels[key] ?? key)
                .pos(this.x + this.boxSize + this.gap, ry)
                .scale(this.scale).color(this.color).buildAndAdd()

            this.rows.push({ box, check, text })
        }

        this.rendered = true
        return this
    }

    /** 移除所有元素 */
    remove() {
        if (!this.overlay) return
        if (this.panel) this.overlay.removeElement(this.panel)
        for (const r of this.rows) {
            this.overlay.removeElement(r.box)
            this.overlay.removeElement(r.check)
            this.overlay.removeElement(r.text)
        }
        for (const b of this.buttons) {
            this.overlay.removeElement(b.bg)
            this.overlay.removeElement(b.text)
        }
        this.panel = null
        this.rows = []
        this.buttons = []
        this.rendered = false
    }

    /** @param {Event} event */
    tick(event) {
        if (!this.rendered) return
        if (!event.click()) return

        const mx = Hud.getMouseX() - this.screenOffsetX
        const my = Hud.getMouseY() - this.screenOffsetY

        // 按钮
        for (const b of this.buttons) {
            if (mx >= b.x1 && mx <= b.x2 &&
                my >= this.y && my <= this.y + this.buttonHeight) {
                if (b.action === 'all') this.selectAll()
                else if (b.action === 'invert') this.invertAll()
                return
            }
        }

        // 复选框
        for (let i = 0; i < this.keys.length; i++) {
            const ry = this._contentY + i * this.rowHeight
            if (mx >= this.x && mx <= this.x + this.boxSize &&
                my >= ry && my <= ry + this.boxSize) {
                this.toggle(this.keys[i])
                return
            }
        }
    }

    /** 同步复选框显示 */
    _syncCheck() {
        for (let i = 0; i < this.keys.length; i++) {
            const on = !!this.selected[this.keys[i]]
            this.rows[i].check.setAlpha(on ? 255 : 0)
        }
    }

    /** 同步文字 */
    _syncTexts() {
        for (let i = 0; i < this.keys.length; i++) {
            const key = this.keys[i]
            this.rows[i].text.setText(this.labels[key] ?? key)
        }
    }
}

/** 网格边长（方块）—— 与 MC 区块对齐 */
const CHUNK_SIZE = 16
/** 以相机中心为圆心的最大可见区块半径（缩小时可见范围不会爆炸） */
const MAX_CHUNK_RADIUS = 40
/** 单帧最多处理的矿脉数（超出则按距离裁剪） */
const MAX_VEINS_PER_FRAME = 1000

function main() {
    screen_listener = JsMacros.on('OpenScreen', JavaWrapper.methodToJava(() => {
        const screen = Hud.getOpenScreen()
        bus.remove(filter_listener)
        if (screen && Reflection.getClassName(screen) == 'xaero.map.gui.GuiMap') {
            let veins, total, recipes
            try {
                const data = readVeins()
                veins = data.veins
                total = data.total
                recipes = data.map
            } catch (e) {
                mclog(`读取矿脉失败: ${e}`, 0xc)
                return
            }
            if (!veins || total === 0) {
                mclog('当前世界没有矿脉数据', 0xe)
                return
            }

            const mineralMap = readMineralMap(recipes)
            IeMineral.init(mineralMap, ExcavatorHandler.mineralVeinYield)

            const guimap = new GuiMap(screen)
            const region = { x: 0, y: 0, width: 0, height: 0 }
            Client.runOnMainThread(JavaWrapper.methodToJava(() => {
                region.width = guimap.width
                region.height = guimap.height
            }), true, 1000)
            const d2d = Hud.createDraw2D()
            screen.addDraw2D(d2d, region.x, region.y, region.width, region.height)
            const dim = World.getDimension()
            /** @type {IeMineral[]} */
            const veinList = veins[dim] || []

            /** @type {Record<string, IeMineral[]>} */
            const veinMaps = {}
            /** @type {Record<string, IeMineral[]>} 区块坐标 "cx cz" → 矿脉列表 */
            const chunkGrid = {}

            veinList.map(v => {
                let k = v.mineral
                let c = new IeMineral(guimap, d2d, v)
                if (veinMaps[k])
                    veinMaps[k].push(c)
                else
                    veinMaps[k] = [c]

                const cx = Math.floor(v.x / CHUNK_SIZE)
                const cz = Math.floor(v.z / CHUNK_SIZE)
                const ck = `${cx} ${cz}`
                if (!chunkGrid[ck]) chunkGrid[ck] = []
                chunkGrid[ck].push(c)
            })

            const initialSelected = {}
            const labels = {}
            for (let k of Object.keys(veinMaps)) {
                if (veinMaps[k].length > 0) {
                    initialSelected[k] = IeMineral.MINERAL_MAP[k].visiable
                    labels[k] = `${(IeMineral.MINERAL_MAP[k].transName ?? k).replace(/^.+\./, '')} (${veinMaps[k].length})`
                }
            }

            const filterRegion = {
                x: 25, y: 10,
                width: 200,
                height: Math.min(300, guimap.height - 20)
            }
            const filter_d2d = new Draw2DUtils(filterRegion)
            screen.addDraw2D(filter_d2d.target, filterRegion.x, filterRegion.y, filterRegion.width, filterRegion.height)

            const filter = new MultiSelect({
                selected: initialSelected,
                x: 4, y: 4, rowHeight: 12, boxSize: 8,
                gap: 4, scale: 0.8,
                color: 0xFFFFFF, boxColor: 0xAAAAAA, checkColor: 0x55FF55, panelAlpha: 200,
                screenOffsetX: filterRegion.x,
                screenOffsetY: filterRegion.y,
                onChange: (key, selected) => {
                    IeMineral.MINERAL_MAP[key].visiable = selected
                    if (!selected)
                        for (let m of veinMaps[key])
                            m.visiable = false
                }
            })
            filter.setLabels(labels)
            filter.render(filter_d2d.target)
            bus.remove(filter_listener)

            let lastVisible = new Set()

            filter_listener = bus.addListener(event => {
                filter.tick(event)
                filter_d2d.tooltips = []

                const scale = guimap.scale()
                const halfW = guimap.width / 2 / scale
                const halfH = guimap.height / 2 / scale
                const camX = guimap.cameraX
                const camZ = guimap.cameraZ

                // 1. 按可见范围算区块半径，但不超过 MAX_CHUNK_RADIUS
                const radiusX = Math.min(MAX_CHUNK_RADIUS, Math.ceil(halfW / CHUNK_SIZE) + 1)
                const radiusZ = Math.min(MAX_CHUNK_RADIUS, Math.ceil(halfH / CHUNK_SIZE) + 1)
                const cxCenter = Math.floor(camX / CHUNK_SIZE)
                const czCenter = Math.floor(camZ / CHUNK_SIZE)
                const cx0 = cxCenter - radiusX
                const cx1 = cxCenter + radiusX
                const cz0 = czCenter - radiusZ
                const cz1 = czCenter + radiusZ

                // 2. 收集可见候选
                const candidates = []
                for (let cx = cx0; cx <= cx1; cx++) {
                    for (let cz = cz0; cz <= cz1; cz++) {
                        const bucket = chunkGrid[`${cx} ${cz}`]
                        if (!bucket) continue
                        for (const m of bucket) {
                            if (!IeMineral.MINERAL_MAP[m.mineral].visiable) continue
                            candidates.push(m)
                        }
                    }
                }

                // 3. 超过上限则按距离相机远近裁剪
                let shown
                if (candidates.length > MAX_VEINS_PER_FRAME) {
                    candidates.sort((a, b) => {
                        const da = (a.x - camX) ** 2 + (a.z - camZ) ** 2
                        const db = (b.x - camX) ** 2 + (b.z - camZ) ** 2
                        return da - db
                    })
                    shown = candidates.slice(0, MAX_VEINS_PER_FRAME)
                    filter_d2d.tooltips.push(`§c显示 ${MAX_VEINS_PER_FRAME}/${candidates.length}（按距离裁剪）`)
                } else {
                    shown = candidates
                }

                // 4. 更新显示
                const nowVisible = new Set()
                for (const m of shown) {
                    m.update()
                    if (m.focus()) filter_d2d.tooltips = m.details
                    nowVisible.add(m)
                }

                // 5. 隐藏切出的
                for (const m of lastVisible) {
                    if (!nowVisible.has(m)) m.visiable = false
                }
                lastVisible = nowVisible
            })
        }
    }))
}

const bus = new EventBus()
/** @type {string|null} filter_listener 监听 id */
let filter_listener = null
if (isToggle()) {
    bus.start()
    main()
    while (isToggle()) {
        Client.waitTick(5)
    }
}

bus?.stop()
Hud.clearDraw2Ds()
if (screen_listener)
    JsMacros.off(screen_listener)
