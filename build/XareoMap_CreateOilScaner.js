// 脚本名称: 机械动力:柴油动力油田扫描
// 功能介绍: 在Xaero地图上显示柴油动力油田储量，Alt+左键扫描，Alt+H键隐藏高亮
// 依赖模组: 宏(jsmacros)、机械动力:柴油动力(Create: Diesel Generators)、Xaero地图
// 更新内容: v1.0 初始化脚本
// 更新内容: v1.1 调整缓存格式，油田关键参数也一同保存
// 更新内容: v1.2 添加地图渲染管线，统一存储到存档目录下
// 更新内容: v1.3 在服务器中可以自己填入种子，依照已记录地图的群系计算油田

/**
 * @type {number} 自定义种子，末尾要带n，防止长种子精度损失，例如：123456789123456789n
 * @description 仅在服务器中客户端会用该种子来计算油田数值，单人存档会自动获取种子
 */
const CUSTOM_SEED = null
// ==================== 全局渲染参数 ====================
/** 渲染半径（区块） */
const MARKER_RADIUS = 15
/** 未扫描遮罩半径（区块） */
const MOUSE_RADIUS = 15
/** 刷新间隔（tick） */
const REFRESH_INTERVAL_TICKS = 5
/** 扫描半径（区块） */
const SCAN_RADIUS = 15


const scriptName = file.getName().replace(/\.(js|ts)$/, '')
const _session = `${scriptName}:session`
const _enabled = `${scriptName}:enabled`
const session = GlobalVars.incrementAndGetInt(_session)
const _listener = {
    tick: null, counter: 0, step: 3, offHandle: null,
    /** @param {Function} handle */
    on(handle) {
        this.tick = JsMacros.on('Tick', JavaWrapper.methodToJava(() => {
            if (!isEnabled()) return this.off()
            if (++this.counter % this.step != 0) return
            handle?.()
        }))
        return this
    },
    /** @returns {this} */
    off() { this.offHandle?.(); this.tick && JsMacros.off(this.tick); this.tick = null; return this }
}
/** @param {string} msg @param {number} [color=7] */
const mclog = (msg, color = 7) => Chat.log(`§7[§5${scriptName}§7] §${(color % 16).toString(16)}${msg}`)
/** @returns {boolean} */
const isEnabled = () => GlobalVars.getBoolean(_enabled) && GlobalVars.getInt(_session) == session
/** @param {boolean} [v] */
const toggleEnabled = (v) => mclog(GlobalVars.putBoolean(_enabled, v ?? !isEnabled()) ? "启用" : "关闭")
const _dev = false

// ==================== 预计算偏移 ====================
/** @type {[number, number][]} 有油区块渲染偏移 */
const OFFSETS_MARKER = []
for (let dx = -MARKER_RADIUS; dx <= MARKER_RADIUS; dx++)
    for (let dz = -MARKER_RADIUS; dz <= MARKER_RADIUS; dz++)
        OFFSETS_MARKER.push([dx, dz])
/** @type {[number, number][]} 未扫描遮罩偏移 */
const OFFSETS_MOUSE = []
for (let dx = -MOUSE_RADIUS; dx <= MOUSE_RADIUS; dx++)
    for (let dz = -MOUSE_RADIUS; dz <= MOUSE_RADIUS; dz++)
        OFFSETS_MOUSE.push([dx, dz])

// ==================== 类型定义 ====================
/**
 * @typedef {com.mojang.blaze3d.platform.Window} Window
 * @typedef {net.minecraft.network.chat.Component} Component
 * @typedef {net.minecraft.client.gui.DrawContext} DrawContext
 * @typedef {net.minecraft.client.font.TextRenderer} TextRenderer
 * @typedef {Packages.xyz.wagyourtail.jsmacros.api.math.Pos2D} type_pos2d
 * @typedef {Packages.xyz.wagyourtail.jsmacros.api.math.Vec2D} type_vec2d
 * @typedef {{timestamp:number,interval:number,mouse:type_pos2d}} eventCache
 * @typedef {'holding'|'pressed'|'released'} enum_keyState
 * @typedef {(event:Event)=>void} handle_eventCallback
 * @typedef {{color:number, texture:CustomImage?, label:string}} OilMarkerStateDef 油田标记状态定义
 * @typedef {{x:number, y:number}} Point2D
 * @typedef {{cx:number, cz:number}} ChunkCoord
 */

// ==================== 反射工具 ====================
/** 反射工具 @template T */
class DeobfRef {
    /**
     * 探测类名
     * @param {string[]} names 候选名
     * @returns {string?}
     */
    static className(...names) {
        for (const n of names)
            try { return Reflection.getClass(n).getName() } catch { }
        return null
    }
    /**
     * 探测字段名
     * @param {string} cls
     * @param {string[]} names 候选名
     * @returns {string?}
     */
    static fieldName(cls, ...names) {
        const fields = Reflection.getClass(cls).getDeclaredFields()
        for (let n of names)
            for (let m of fields)
                if (m.getName() === n) return n
        return null
    }
    /**
     * 探测方法名
     * @param {string} cls
     * @param {string[]} names 候选名
     * @returns {string?}
     */
    static methodName(cls, ...names) {
        const methods = Reflection.getClass(cls).getDeclaredMethods()
        for (let n of names)
            for (let m of methods)
                if (m.getName() === n) return n
        return null
    }
    /**
     * 按顺序尝试加载类，返回第一个成功的
     * @template {string} C
     * @param {C[]} class_names
     * @returns {GetJava.Type$Graal<C>?}
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
     * @returns {DeobfRef<C>?}
     */
    static Class(...class_names) {
        let type = this.Type(...class_names)
        return type ? new this(type) : null
    }
    /** @param {T} v 被反射包装的对象或 Java 类 */
    constructor(v) {
        /** @type {T} */
        this.target = v
        /** @type {Packages.org.joor.Reflect} */
        this.reflect = Reflection.getReflect(this.target)
    }
    /** @returns {string} 类名 */
    get classname() { return Reflection.getClassName(this.target) }
    /** @returns {GetJava.Type$Graal<T>} Graal 版 Java 类 */
    get type() { return Java.type(this.classname) }
    /** @returns {JavaClass<T>} 反射版 Java 类 */
    get class() { return Reflection.getClass(this.classname) }
    /** @returns {string[]} 所有字段名（缓存） */
    get fields() { return this._fields ??= this.class.getDeclaredFields().map(v => v.getName()) }
    /** @returns {string[]} 所有方法名（缓存） */
    get methods() { return this._methods ??= this.class.getDeclaredMethods().map(v => v.getName()) }
    /** @param {string[]} names 候选字段名（按优先级） @returns {string?} */
    fieldName(...names) {
        let fields = this.fields
        for (let name of names)
            if (fields.includes(name)) return name
        return null
    }
    /** @param {string[]} names 候选字段名（按优先级） @returns {*} */
    get(...names) {
        let name = this.fieldName(...names)
        if (name)
            try { return this.reflect.field(name).get() }
            catch { return this.target[name] }
        return null
    }
    /** @param {string[]} method_names 候选方法名（按优先级） @returns {string?} */
    methodName(...method_names) {
        let methods = this.methods
        for (let name of method_names)
            if (methods.includes(name))
                return name
        return null
    }
    /**
     * 按方法名调用
     * @param {string} method_name
     * @param {*[]} args
     * @returns {*}
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
     * @param {string[]} method_names
     * @param {*[]} args
     * @returns {*}
     */
    call(method_names, ...args) {
        let name = this.methodName(...method_names)
        return name ? this.invoke(name, ...args) : null
    }
}

// ==================== Java 类引用 ====================
/** @type {JavaClass<ChunkPos>} */
const ChunkPos = Java.type('net.minecraft.world.level.ChunkPos')
/** @type {JavaClass<OilChunksSavedData>} */
const OilChunksSavedData = Java.type('com.jesz.createdieselgenerators.world.OilChunksSavedData')
/** @type {JavaClass<CDGConfig>} */
const CDGConfig = Java.type('com.jesz.createdieselgenerators.CDGConfig')
/** @type {JavaClass?} */
const CDGTags = DeobfRef.Type('com.jesz.createdieselgenerators.CDGTags')
/** @type {DeobfRef<PerlinNoise>?} */
const PerlinNoise = DeobfRef.Class('net.minecraft.world.level.levelgen.synth.PerlinNoise')
/** @type {DeobfRef<RandomSource>?} */
const RandomSource = DeobfRef.Class('net.minecraft.util.RandomSource')

// ==================== 长类名集中管理 ====================
const IMPORT = {
    Object: 'java.lang.Object',
    Double: 'java.lang.Double',
    Boolean: 'java.lang.Boolean',
    String: 'java.lang.String',
    ArrayList: 'java.util.ArrayList',
    Collections: 'java.util.Collections',
    Iterator: 'java.util.Iterator',
    Function: 'java.util.function.Function',
    Throwable: 'java.lang.Throwable',
    GuiGraphics: DeobfRef.className(
        'net.minecraft.client.gui.GuiGraphics', 'net.minecraft.class_332',
        'net.minecraft.client.gui.DrawContext', 'net.minecraft.src.C_279497_'),
    BufferSource: DeobfRef.className(
        'net.minecraft.client.renderer.MultiBufferSource$BufferSource', 'net.minecraft.class_4597$class_4598',
        'net.minecraft.client.render.VertexConsumerProvider$Immediate', 'net.minecraft.src.C_4139_$C_4140_'),
    Minecraft: DeobfRef.className(
        'net.minecraft.client.Minecraft', 'net.minecraft.class_310',
        'net.minecraft.client.MinecraftClient', 'net.minecraft.src.C_3391_'),
    Renderable: DeobfRef.className(
        'net.minecraft.client.gui.components.Renderable', 'net.minecraft.class_4068',
        'net.minecraft.client.gui.Drawable', 'net.minecraft.src.C_252359_'),
    Minimap: 'xaero.minimap.XaeroMinimap',
    MiniLocation: 'xaero.hud.minimap.element.render.MinimapElementRenderLocation',
    MiniInfo: 'xaero.hud.minimap.element.render.MinimapElementRenderInfo',
    MiniProvider: 'xaero.hud.minimap.element.render.MinimapElementRenderProvider',
    MiniReader: 'xaero.hud.minimap.element.render.MinimapElementReader',
    MiniRenderer: 'xaero.hud.minimap.element.render.MinimapElementRenderer',
    MiniRendererHandler: 'xaero.hud.minimap.element.render.MinimapElementRendererHandler',
    MiniTextureProvider: 'xaero.common.graphics.renderer.multitexture.MultiTextureRenderTypeRendererProvider',
    WorldMap: 'xaero.map.WorldMap',
    WorldLocation: 'xaero.map.element.render.ElementRenderLocation',
    WorldInfo: 'xaero.map.element.render.ElementRenderInfo',
    WorldProvider: 'xaero.map.element.render.ElementRenderProvider',
    WorldReader: 'xaero.map.element.render.ElementReader',
    WorldRenderer: 'xaero.map.element.render.ElementRenderer',
    WorldTextureProvider: 'xaero.map.graphics.renderer.multitexture.MultiTextureRenderTypeRendererProvider',
}

// ==================== 动态类构建工厂 ====================
/** 动态类构建工厂（小地图 + 世界地图） */
class ModBuilder {
    static package = 'xyz.wagyourtail.jsmacros.core.library.impl.classes.proxypackage.'
    static namespace = 'XaeroOil'
    static suffix = _dev ? `_${Date.now()}` : ''
    static Element = `${this.namespace}_Element${this.suffix}`
    static Context = `${this.namespace}_Context${this.suffix}`
    static MINIMAP = {
        Provider: `${this.namespace}_MinimapProvider${this.suffix}`,
        Reader: `${this.namespace}_MinimapReader${this.suffix}`,
        Renderer: `${this.namespace}_MinimapRenderer${this.suffix}`,
    }
    static WORLDMAP = {
        Provider: `${this.namespace}_WorldMapProvider${this.suffix}`,
        Reader: `${this.namespace}_WorldMapReader${this.suffix}`,
        Renderer: `${this.namespace}_WorldMapRenderer${this.suffix}`,
    }
    /** @param {string} name @returns {string} */
    static className(name) { return this.package + name }
    /** @param {string} name @returns {JavaClass?} */
    static load(name) { try { return Reflection.getClassFromClassBuilderResult(name) } catch { return null } }
    /**
     * 构建类
     * @template {string} C
     * @param {{ name:C, extend:string, fields:string[], constructors:string[], methods:string[] }} opts
     * @returns {JavaClass<C>}
     */
    static builder(opts) {
        const { name, extend, fields, constructors, methods } = opts
        let builder = Reflection.createClassBuilder(name, Java.type(extend ?? 'java.lang.Object'))
        fields?.forEach(v => builder.addField(v))
        constructors?.forEach(v => builder.addConstructor(v))
        methods?.forEach(v => builder.addMethod(v))
        return builder.finishBuildAndFreeze()
    }
    /** @returns {JavaClass} */
    static createElementClass() {
        const name = this.Element
        const { String, Function } = IMPORT
        return this.load(name) ?? this.builder({
            name: name,
            fields: [
                `public int x;`, `public int z;`,
                `public int color = 0x80FF0000;`,
                `public int size = 16;`,
                `public boolean large = false;`,
                `public ${Function} render = null;`,
            ],
            constructors: [`public ${name}(int x, int z, int color, int size, boolean large, ${Function} render) {
                this.x = x; this.z = z; this.color = color; this.size = size; this.large = large; this.render = render;
            }`],
            methods: [
                `public double centerX() { return (this.x + 0.5) * 16.0; }`,
                `public double centerZ() { return (this.z + 0.5) * 16.0; }`,
                `public ${String} displayName() { return x + "," + z; }`,
            ]
        })
    }
    /** @returns {JavaClass} */
    static createContextClass() {
        const name = this.Context
        const { ArrayList } = IMPORT
        return this.load(name) ?? this.builder({
            name: name,
            fields: [
                `public ${ArrayList} elements = new ${ArrayList}();`,
                `public double scale = 1.0;`,
                `public boolean enabled = true;`,
            ],
            constructors: [`public ${name}() { super(); }`],
        })
    }
    /**
     * @param {string} name
     * @param {string} extend
     * @param {string} location
     * @returns {JavaClass}
     */
    static createProviderClass(name, extend, location) {
        const { Object, Iterator, Collections, ArrayList, Minecraft } = IMPORT
        let element = this.className(this.Element)
        let context = this.className(this.Context)
        const mcGet = DeobfRef.methodName(Minecraft, 'getInstance', 'method_1551', 'm_91087_')
        const mcPlayerField = DeobfRef.fieldName(Minecraft, 'player', 'field_1724', 'f_91074_')
        const entityCls = DeobfRef.className(
            'net.minecraft.world.entity.Entity', 'net.minecraft.class_1297',
            'net.minecraft.entity.Entity', 'net.minecraft.src.C_507_')
        const pGetX = DeobfRef.methodName(entityCls, 'getX', 'method_23317', 'm_20185_')
        const pGetZ = DeobfRef.methodName(entityCls, 'getZ', 'method_23321', 'm_20189_')
        const MINI_MAX_DIST = 180
        return this.load(name) ?? this.builder({
            name: name, extend: extend,
            fields: [`public ${Iterator} iterator = ${Collections}.emptyIterator();`],
            constructors: [`public ${name}() { super(); }`],
            methods: [
                `public void begin(${location} location, ${Object} ctx) {
                    ${context} context = (${context}) ctx;
                    if (location != ${location}.OVER_MINIMAP) {
                        this.iterator = new ${ArrayList}(((${context}) ctx).elements).iterator();
                        return;
                    }
                    ${ArrayList} filtered = new ${ArrayList}();
                    ${Minecraft} mc = ${Minecraft}.${mcGet}();
                    if (mc != null && mc.${mcPlayerField} != null) {
                        double px = mc.${mcPlayerField}.${pGetX}();
                        double pz = mc.${mcPlayerField}.${pGetZ}();
                        double maxDistSq = java.lang.Math.pow(${MINI_MAX_DIST} / context.scale, 2.0);
                        ${ArrayList} elements = context.elements;
                        for (int i = 0; i < elements.size(); i++) {
                            ${element} el = (${element}) elements.get(i);
                            if (el == null) continue;
                            double dx = el.centerX() - px;
                            double dz = el.centerZ() - pz;
                            if (dx * dx + dz * dz <= maxDistSq) filtered.add(el);
                        }
                    }
                    this.iterator = filtered.iterator();
                }`,
                `public boolean hasNext(${location} loc, ${Object} ctx) { return this.iterator.hasNext(); }`,
                `public ${Object} getNext(${location} loc, ${Object} ctx) {
                    return this.iterator.hasNext() ? this.iterator.next() : null;
                }`,
                `public void end(${location} loc, ${Object} ctx) { this.iterator = ${Collections}.emptyIterator(); }`,
            ]
        })
    }
    /**
     * @param {string} name
     * @param {string} extend
     * @param {string} location
     * @returns {JavaClass}
     */
    static createReaderClass(name, extend, location) {
        const { Object, String, Minecraft } = IMPORT
        let elm = this.className(this.Element)
        let ctx = this.className(this.Context)
        return this.load(name) ?? this.builder({
            name: name, extend: extend,
            constructors: [`public ${name}() { super(); }`],
            methods: [
                `public boolean isHidden(${Object} e, ${Object} c) { return e == null; }`,
                `public double getRenderX(${Object} e, ${Object} c, float p) { return ((${elm}) e).centerX(); }`,
                `public double getRenderY(${Object} e, ${Object} c, float p) { return 0.0; }`,
                `public double getRenderZ(${Object} e, ${Object} c, float p) { return ((${elm}) e).centerZ(); }`,
                `public int getInteractionBoxLeft(${Object} e, ${Object} c, float p) { return (int) -((${elm}) e).size / 2; }`,
                `public int getInteractionBoxRight(${Object} e, ${Object} c, float p) { return (int) ((${elm}) e).size / 2; }`,
                `public int getInteractionBoxTop(${Object} e, ${Object} c, float p) { return (int) -((${elm}) e).size / 2; }`,
                `public int getInteractionBoxBottom(${Object} e, ${Object} c, float p) { return (int) ((${elm}) e).size / 2; }`,
                `public int getRenderBoxLeft(${Object} e, ${Object} c, float p) { return (int) -((${elm}) e).size / 2; }`,
                `public int getRenderBoxRight(${Object} e, ${Object} c, float p) { return (int) ((${elm}) e).size / 2; }`,
                `public int getRenderBoxTop(${Object} e, ${Object} c, float p) { return (int) -((${elm}) e).size / 2; }`,
                `public int getRenderBoxBottom(${Object} e, ${Object} c, float p) { return (int) ((${elm}) e).size / 2; }`,
                `public int getLeftSideLength(${Object} e, ${Minecraft} mc) { return ((${elm}) e).size; }`,
                `public ${String} getMenuName(${Object} e) { return ((${elm}) e).displayName(); }`,
                `public ${String} getFilterName(${Object} e) { return this.getMenuName(e); }`,
                `public int getMenuTextFillLeftPadding(${Object} e) { return 0; }`,
                `public int getRightClickTitleBackgroundColor(${Object} e) { return ((${elm}) e).color; }`,
                `public boolean shouldScaleBoxWithOptionalScale() { return false; }`,
                `public float getBoxScale(${location} loc, ${Object} e, ${Object} c) { return (float) ((${ctx}) c).scale; }`,
                `public boolean isInteractable(${location} location, ${Object} element) { return true; }`,
            ]
        })
    }
    /** @returns {JavaClass} */
    static createMinimapProviderClass() {
        return this.createProviderClass(this.MINIMAP.Provider, IMPORT.MiniProvider, IMPORT.MiniLocation)
    }
    /** @returns {JavaClass} */
    static createMinimapReaderClass() {
        return this.createReaderClass(this.MINIMAP.Reader, IMPORT.MiniReader, IMPORT.MiniLocation)
    }
    /** @returns {JavaClass} */
    static createMinimapRendererClass() {
        const name = this.MINIMAP.Renderer
        const { MiniRenderer, MiniLocation, MiniInfo, BufferSource, MiniTextureProvider, Object, GuiGraphics, Double, Boolean, Throwable } = IMPORT
        let element = this.className(this.Element)
        let context = this.className(this.Context)
        let reader = this.className(this.MINIMAP.Reader)
        let provider = this.className(this.MINIMAP.Provider)
        return this.load(name) ?? this.builder({
            name: name, extend: MiniRenderer,
            constructors: [`public ${name}(${context} ctx) { super(new ${reader}(), new ${provider}(), ctx); }`],
            methods: [
                `public boolean shouldRender(${MiniLocation} loc) {
                    return loc == ${MiniLocation}.OVER_MINIMAP && ((${context}) this.context).enabled; }`,
                `public int getOrder() { return 0; }`,
                `public void preRender(${MiniInfo} info, ${BufferSource} buf, ${MiniTextureProvider} tex) {
                    ((${context}) this.context).scale = xaero.common.HudMod.INSTANCE.getMinimap().getMinimapFBORenderer().getZoom();
                }`,
                `public void postRender(${MiniInfo} info, ${BufferSource} buf, ${MiniTextureProvider} tex) {}`,
                `public boolean renderElement(
                        ${Object} el, boolean hovered, boolean highlighted, double depth, float screenSizeBasedScale,
                        double localX, double localY, ${MiniInfo} info, ${GuiGraphics} graphics, ${BufferSource} buf) {
                    if (el == null || graphics == null || info == null) return false;
                    if (!((${context}) this.context).enabled) return false;
                    ${element} e = (${element}) el;
                    if (e.render == null) return false;
                    double scale = ((${context}) this.context).scale;
                    if (!${Double}.isFinite(scale) || scale <= 0.0 || scale > 64.0) scale = 1.0;
                    try {
                        ${Object}[] args = new ${Object}[] {
                            graphics, el, info,
                            ${Double}.valueOf(localX),
                            ${Double}.valueOf(localY),
                            ${Double}.valueOf(scale),
                            ${Boolean}.FALSE,
                            ${Boolean}.valueOf(hovered)
                        };
                        ${Object} result = e.render.apply(args);
                        return (result instanceof ${Boolean}) && ((${Boolean}) result).booleanValue();
                    } catch (${Throwable} t) { return false; }
                }`,
            ]
        })
    }
    /** @returns {JavaClass} */
    static createWorldMapProviderClass() {
        return this.createProviderClass(this.WORLDMAP.Provider, IMPORT.WorldProvider, IMPORT.WorldLocation)
    }
    /** @returns {JavaClass} */
    static createWorldMapReaderClass() {
        return this.createReaderClass(this.WORLDMAP.Reader, IMPORT.WorldReader, IMPORT.WorldLocation)
    }
    /** @returns {JavaClass} */
    static createWorldMapRendererClass() {
        const name = this.WORLDMAP.Renderer
        const { WorldRenderer, WorldLocation, WorldInfo, BufferSource, WorldTextureProvider, Object, GuiGraphics, Double, Boolean, Throwable } = IMPORT
        let element = this.className(this.Element)
        let context = this.className(this.Context)
        let reader = this.className(this.WORLDMAP.Reader)
        let provider = this.className(this.WORLDMAP.Provider)
        return this.load(name) ?? this.builder({
            name: name, extend: WorldRenderer,
            constructors: [`public ${name}(${context} ctx) { super(ctx, new ${provider}(), new ${reader}()); }`],
            methods: [
                `public boolean shouldRender(${WorldLocation} location, boolean shadow) { return true; }`,
                `public int getOrder() { return 0; }`,
                `public boolean shouldBeDimScaled() { return false; }`,
                `public void preRender(${WorldInfo} info, ${BufferSource} buf, ${WorldTextureProvider} rp, boolean shadow) {
                    ((${context}) this.context).scale = info.scale;
                }`,
                `public void postRender(${WorldInfo} info, ${BufferSource} buf, ${WorldTextureProvider} rp, boolean shadow) {}`,
                `public void renderElementShadow(${Object} e, boolean h, float os, double px, double py,
                    ${WorldInfo} info, ${GuiGraphics} g, ${BufferSource} buf, ${WorldTextureProvider} rp) {}`,
                `public boolean renderElement(
                        ${Object} element, boolean hovered, double optionalDepth, float optionalScale,
                        double partialX, double partialY, ${WorldInfo} info, ${GuiGraphics} graphics,
                        ${BufferSource} bufferSource, ${WorldTextureProvider} rendererProvider) {
                    if (!((${context}) this.context).enabled) return false;
                    ${element} el = (${element}) element;
                    if (el.render == null) return false;
                    try {
                        double scale = info.scale;
                        ${Object}[] args = new ${Object}[] {
                            graphics, el, info,
                            ${Double}.valueOf(partialX),
                            ${Double}.valueOf(partialY),
                            ${Double}.valueOf(scale),
                            ${Boolean}.TRUE,
                            ${Boolean}.valueOf(hovered)
                        };
                        ${Object} result = el.render.apply(args);
                        return (result instanceof ${Boolean}) && ((${Boolean}) result).booleanValue();
                    } catch (${Throwable} t) { return false; }
                }`,
            ]
        })
    }
}

// ==================== 渲染层管理器 ====================
/** 渲染层管理器（小地图 + 世界地图） */
class XaeroOverlayManager {
    constructor() {
        /** @type {JavaClass?} */
        this.ElementCls = null
        /** @type {JavaClass?} */
        this.ContextCls = null
        /** @type {boolean} */
        this.minimapInited = false
        /** @type {xaero.hud.minimap.element.render.over.MinimapElementOverMapRendererHandler?} */
        this.minimapHandler = null
        /** @type {object?} */
        this.minimapContext = null
        /** @type {object?} */
        this.minimapRenderer = null
        /** @type {boolean} */
        this.worldMapInited = false
        /** @type {xaero.map.element.MapElementRenderHandler?} */
        this.worldMapHandler = null
        /** @type {object?} */
        this.worldMapContext = null
        /** @type {object?} */
        this.worldMapRenderer = null
    }
    /** @returns {this} 注册小地图渲染层 */
    registerMinimap() {
        if (this.minimapInited) return this
        this.minimapHandler = Java.type(IMPORT.Minimap).instance.getMinimap().getOverMapRendererHandler()
        ModBuilder.createMinimapProviderClass()
        ModBuilder.createMinimapReaderClass()
        const rendererCls = ModBuilder.createMinimapRendererClass()
        this.minimapContext = Reflection.newInstance(this.ContextCls)
        this.minimapRenderer = Reflection.newInstance(rendererCls, this.minimapContext)
        this.minimapHandler.add(this.minimapRenderer)
        this.minimapInited = true
        return this
    }
    /** @returns {this} 注册世界地图渲染层 */
    registerWorldMap() {
        if (this.worldMapInited) return this
        this.worldMapHandler = Java.type(IMPORT.WorldMap).mapElementRenderHandler
        ModBuilder.createWorldMapProviderClass()
        ModBuilder.createWorldMapReaderClass()
        const rendererCls = ModBuilder.createWorldMapRendererClass()
        this.worldMapContext = Reflection.newInstance(this.ContextCls)
        this.worldMapRenderer = Reflection.newInstance(rendererCls, this.worldMapContext)
        this.worldMapHandler.add(this.worldMapRenderer)
        this.worldMapInited = true
        return this
    }
    /** @returns {this} 注册所有渲染层 */
    register() {
        this.ElementCls = ModBuilder.createElementClass()
        this.ContextCls = ModBuilder.createContextClass()
        this.registerMinimap()
        this.registerWorldMap()
        mclog('地图渲染层已注册')
        return this
    }
    /** @returns {boolean} */
    unregister() {
        if (this.minimapInited) {
            const cls = Reflection.getClass(IMPORT.MiniRendererHandler)
            const f = Reflection.getDeclaredField(cls, 'renderers')
            f.setAccessible(true)
            f.get(this.minimapHandler).remove(this.minimapRenderer)
            this.minimapInited = false
            this.minimapRenderer = this.minimapContext = null
        }
        if (this.worldMapInited) {
            const f = this.worldMapHandler.getClass().getDeclaredField('renderers')
            f.setAccessible(true)
            if (f != null) f.get(this.worldMapHandler).remove(this.worldMapRenderer)
            this.worldMapInited = false
            this.worldMapRenderer = this.worldMapContext = null
        }
        mclog('渲染层已卸载')
        return true
    }
    /**
     * 添加一个高亮元素
     * @param {number} cx
     * @param {number} cz
     * @param {number} [color=0x80FF0000]
     * @param {number} [size=16]
     * @param {boolean} [large=false]
     * @param {Function?} [render=null]
     * @returns {object}
     */
    addElement(cx, cz, color = 0x80FF0000, size = 16, large = false, render = null) {
        if (!this.minimapInited && !this.worldMapInited) throw new Error('XaeroOverlayManager 未 register')
        const el = Reflection.newInstance(this.ElementCls, cx | 0, cz | 0, color | 0, size | 0, !!large, render)
        this.minimapInited && this.minimapContext.elements.add(el)
        this.worldMapInited && this.worldMapContext.elements.add(el)
        return el
    }
    /** @param {object} handle @returns {boolean} */
    removeElement(handle) {
        if (!handle) return false
        let removed = false
        if (this.minimapInited) removed = this.minimapContext.elements.remove(handle) || removed
        if (this.worldMapInited) removed = this.worldMapContext.elements.remove(handle) || removed
        return removed
    }
    /** @param {boolean} v @returns {boolean} */
    setEnabled(v) {
        if (this.minimapInited) this.minimapContext.enabled = v
        if (this.worldMapInited) this.worldMapContext.enabled = v
        return v
    }
    /** @returns {boolean} */
    isEnabled() {
        return (this.minimapInited && this.minimapContext.enabled)
            || (this.worldMapInited && this.worldMapContext.enabled)
    }
    /** @returns {boolean} */
    toggle() { return this.setEnabled(!this.isEnabled()) }
    /** @type {net.minecraft.client.gui.Font} */
    static Font = new DeobfRef(Client.getMinecraft())
        .get('font', 'field_1772', 'textRenderer', 'f_91114_', 'f_91062_')
    /** @param {string[]} tooltips @returns {JavaArray<Component>} */
    static toToolTipComponents(tooltips) {
        let arr = JavaUtils.createArrayList()
        for (let v of tooltips)
            arr.add(Chat.createTextHelperFromString(v).getRaw())
        return arr
    }
    /**
     * 绘制气泡提示框
     * @param {net.minecraft.client.gui.GuiGraphics} graphics
     * @param {number} x
     * @param {number} y
     * @param {JavaArray<Component>} components
     */
    static renderToolTip(graphics, x, y, components) {
        if (graphics) {
            let method = [
                'setComponentTooltipForNextFrame', 'renderComponentTooltip',
                'method_51434', 'drawTooltip', 'm_403688_', 'm_280666_'
            ]
            let dcref = new DeobfRef(graphics)
            let stack = new DeobfRef(dcref.call(['pose', 'method_51448', 'getMatrices', 'm_280168_']))
            stack.call(['pushPose', 'method_22903', 'push', 'm_85836_'])
            let last = stack.call(['last', 'method_23760', 'peek', 'm_85850_'])
            let getPositionMatrix = DeobfRef.methodName(DeobfRef.className(
                'com.mojang.blaze3d.vertex.PoseStack$Pose', 'net.minecraft.class_4587$class_4665',
                'net.minecraft.client.util.math.MatrixStack$Entry', 'net.minecraft.src.C_3181_$C_3183_'
            ), 'pose', 'method_23761', 'getPositionMatrix', 'm_252922_')
            new DeobfRef(last).invoke(getPositionMatrix).identity()
            try {
                dcref.call(method, this.Font, components, Math.round(x), Math.round(y))
                dcref.call(['renderDeferredElements', 'method_73199', 'drawDeferredElements', 'm_280637_'])
            } catch {
                dcref.call(method, this.Font, components, Math.round(x), Math.round(y),
                    Client.getRegistryManager().getItemStack('minecraft:air').getRaw())
            }
            stack.call(['popPose', 'method_22909', 'pop', 'm_85849_'])
        }
    }
}

/** 油田标记状态（按油量分档 + 未扫描） */
const OilMarkerState = {
    LOW: { color: 0x44FF44, texture: null, label: '<25%' },
    MID: { color: 0xFFFF44, texture: null, label: '<50%' },
    HIGH: { color: 0xFF8844, texture: null, label: '<75%' },
    FULL: { color: 0xFF4444, texture: null, label: '<100%' },
    INFINITE: { color: 0xFF00FF, texture: null, label: '≥100%' },
    UNKNOWN: { color: 0xdedede, texture: null, label: '未扫描' },
    /** 预创建所有标记纹理 */
    init() {
        for (const [name, state] of Object.entries(this)) {
            if (typeof state !== 'object' || !('color' in state)) continue
            try {
                state.texture = Hud.createTexture(16, 16, `cdg_oil_marker_${name}`)
                    .setGraphicsColor(0x000000)
                    .fillRect(1, 1, 14, 14)
                    .setGraphicsColor(state.color)

                if (name == 'INFINITE')
                    for (let i = 2; i <= 6; i += 1) {
                        let len = 15 - i * 2
                        state.texture
                            .setGraphicsColor(state.color).drawRoundRect(i, i, len, len, 8, 8)
                            .setXorMode(0x000000).drawRect(i + 1, i + 1, len - 2, len - 2)
                    }
                else if (name == 'UNKNOWN')
                    state.texture.fillRect(2, 2, 12, 12)
                else
                    state.texture.drawRect(3, 3, 9, 9)
                state.texture.update()
            } catch (e) {
                Chat.log(`§c[油田] 纹理创建失败 ${name}: ${e}`)
            }
        }
    },
    /**
     * 油量 → 档位
     * @param {number} oil 油量 mB
     * @param {number} max 100% 阈值
     * @returns {OilMarkerStateDef}
     */
    stateOf(oil, max) {
        if (oil >= 2147483647) return this.INFINITE
        const ratio = oil / max
        if (ratio < 0.25) return this.LOW
        if (ratio < 0.50) return this.MID
        if (ratio < 0.75) return this.HIGH
        return this.FULL
    }
}

/** 油田标记：按区块油量绘制矩形纹理，含未扫描遮罩 */
class OilMarker {
    static utils = Java.type('xaero.hud.minimap.config.util.MinimapConfigClientUtils')
    static minimap = Java.type('xaero.hud.minimap.BuiltInHudModules').MINIMAP

    /**
     * @param {XaeroOverlayManager} overlay
     * @param {typeof OilStore} store
     */
    constructor(overlay, store) {
        /** @type {XaeroOverlayManager} */ this.overlay = overlay
        /** @type {typeof OilStore} */ this.store = store
        /** @type {Map<string, object>} */
        this.elements = new Map()
        /** @type {Set<string>} */
        this.unknownKeys = new Set()
        /** @type {Draw2D} */ this.d2d = Hud.createDraw2D()
        /** @type {string?} */ this.render = DeobfRef.methodName(IMPORT.Renderable, 'render', 'method_25394', 'm_88315_')
        /** @type {boolean} */
        this.enabled = !GlobalVars.getBoolean(`${scriptName}:Hidden`)
    }

    /** 清空所有标记 */
    clear() {
        for (const [k, h] of this.elements) this.overlay.removeElement(h)
        this.elements.clear()
        this.unknownKeys.clear()
    }

    /**
     * 刷新以 (mcx, mcz) 为中心的所有标记
     * @param {number} mcx
     * @param {number} mcz
     */
    updateNearestMask(mcx, mcz) {
        if (!this.enabled) return this.clear()

        const dim = this.store.getDimension()
        const chunkMap = this.store.data.dimensions[dim] ?? {}
        const max = CDGConfig.OIL_CHUNK_INFINITE_THRESHOLD.get()

        // 1. 有油区块
        const want = new Map()
        for (const [dx, dz] of OFFSETS_MARKER) {
            const cx = mcx + dx
            const cz = mcz + dz
            const k = `${cx} ${cz}`
            if (!(k in chunkMap)) continue
            const oil = chunkMap[k]
            if (oil <= 0) continue
            want.set(`${cx},${cz}`, { oil, state: OilMarkerState.stateOf(oil, max) })
        }

        // 2. 未扫描遮罩
        const wantUnknown = new Set()
        for (const [dx, dz] of OFFSETS_MOUSE) {
            const cx = mcx + dx
            const cz = mcz + dz
            const k = `${cx} ${cz}`
            if (k in chunkMap) continue
            wantUnknown.add(`${cx},${cz}`)
        }

        // 3. 移除未扫描遮罩
        for (const k of Array.from(this.unknownKeys)) {
            if (!wantUnknown.has(k)) {
                const h = this.elements.get(k)
                if (h) this.overlay.removeElement(h)
                this.elements.delete(k)
                this.unknownKeys.delete(k)
            }
        }
        // 4. 移除有油区块
        for (const [k, h] of Array.from(this.elements)) {
            if (this.unknownKeys.has(k)) continue
            if (!want.has(k)) {
                this.overlay.removeElement(h)
                this.elements.delete(k)
            }
        }
        // 5. 添加新增有油
        for (const [k, c] of want) {
            if (this.elements.has(k)) continue
            const [cx, cz] = k.split(',').map(Number)
            const el = this.overlay.addElement(cx, cz, c.state.color, 16, false,
                this.makeRender(c.state, c.oil, cx, cz))
            this.elements.set(k, el)
        }
        // 6. 添加新增遮罩
        for (const k of wantUnknown) {
            if (this.elements.has(k)) continue
            const [cx, cz] = k.split(',').map(Number)
            const el = this.overlay.addElement(cx, cz, OilMarkerState.UNKNOWN.color, 16, false,
                this.makeRender(OilMarkerState.UNKNOWN, -1, cx, cz))
            this.elements.set(k, el)
            this.unknownKeys.add(k)
        }
    }

    /**
     * @param {OilMarkerStateDef} state
     * @param {number} oil
     * @param {number} cx
     * @param {number} cz
     * @returns {Function}
     */
    makeRender(state, oil, cx, cz) {
        const self = this
        return JavaWrapper.methodToJava((args) => {
            try {
                const [graphics, e, info, localX, localY, scale, isWorldMap, hovered] = args
                const tex = state.texture
                if (!tex) return false
                const isLocked = OilMarker.utils.getEffectiveNorthLocked(
                    OilMarker.minimap.getCurrentSession().getProcessor().getMinimapSize() / 2, 0)
                const half = (e.size / 2) * scale
                const deg = isWorldMap || isLocked ? 0 : -90 - (Player.getPlayer().getYaw() ?? 0)
                const isUnknown = (state === OilMarkerState.UNKNOWN)
                const alpha = isUnknown ? 80 : (isWorldMap ? 200 : 180)
                const img = self.d2d.imageBuilder()
                    .fromCustomImage(tex).alpha(alpha)
                    .pos((localX - half) | 0, (localY - half) | 0)
                    .size(Math.max(2, (half * 2) | 0), Math.max(2, (half * 2) | 0))
                    .rotation(deg).rotateCenter(true)
                    .build()
                img[self.render](graphics, 0, 0, 0)

                if (isWorldMap && hovered) {
                    let lines
                    if (isUnknown) {
                        lines = [
                            `§7区块: §f${cx}, ${cz}`,
                            `§7状态: §c未扫描`,
                            `§8Alt+左键 扫描此区域`,
                        ]
                    } else {
                        const oilText = oil >= 2147483647 ? '无限' : `${oil.toLocaleString()} mB`
                        lines = [
                            `§e油田 §7(${state.label})`,
                            `§7区块: §f${cx}, ${cz}`,
                            `§7储量: §a${oilText}`,
                        ]
                    }
                    const components = XaeroOverlayManager.toToolTipComponents(lines)
                    XaeroOverlayManager.renderToolTip(graphics, Hud.getMouseX() | 0, Hud.getMouseY() | 0, components)
                }
            } catch (err) { mclog(`[油田渲染] ${err}`, 12) }
            return true
        })
    }

    /** @returns {boolean} 切换开关 */
    toggle() {
        this.enabled = !this.enabled
        GlobalVars.putBoolean(`${scriptName}:Hidden`, this.enabled)
        if (!this.enabled) this.clear()
        return this.enabled
    }
}

// ==================== 世界地图坐标封装 ====================
/** Xaero 世界地图屏幕的坐标转换封装 */
class WorldMap {
    /** @param {IScreen} screen */
    constructor(screen) {
        /** @type {IScreen} */ this.raw = screen
        /** @type {Packages.org.joor.Reflect} */ this.target = Reflection.getReflect(screen)
    }
    /** @returns {number} 屏幕宽（GUI 缩放坐标） */
    get width() { return this.raw.getWidth() }
    /** @returns {number} 屏幕高（GUI 缩放坐标） */
    get height() { return this.raw.getHeight() }
    /** @returns {number} 地图缩放比例 */
    get mapScale() { return this.target.get('scale') }
    /** @returns {number} 地图缩放比例 */
    get userScale() { return this.target.get('userScale') }
    /** @returns {string} 鼠标所在维度 */
    get mouseBlockDim() { return this.target.get('mouseBlockDim') }
    /** @returns {number} 鼠标所在方块坐标 */
    get mouseBlockPosX() { return this.target.get('mouseBlockPosX') }
    /** @returns {number} 鼠标所在方块坐标 */
    get mouseBlockPosY() { return this.target.get('mouseBlockPosY') }
    /** @returns {number} 鼠标所在方块坐标 */
    get mouseBlockPosZ() { return this.target.get('mouseBlockPosZ') }
    /** @returns {number} 地图中心方块坐标 */
    get cameraX() { return this.target.get('cameraX') }
    /** @returns {number} 地图中心方块坐标 */
    get cameraZ() { return this.target.get('cameraZ') }
    /** @returns {MapProcessor} 地图进程 */
    get mapProcessor() { return this.target.get('mapProcessor') }
    /** @returns {int} 地图当前显示层级 */
    get caveLayer() { return this.mapProcessor.getCurrentCaveLayer() }
    /** @returns {ResourceKey<Biome>} 地图纹理群系 */
    getBiomeFromTexture(caveLayer, x, z) {
        let textureLevel = 0
        let userScale = this.userScale
        if (userScale < 1)
            textureLevel = Math.min(Math.floor(Math.log(1 / userScale) / Math.log(2)), 3)
        let leveledRegionShift = 9 + textureLevel
        let mouseRegX = x >> leveledRegionShift, mouseRegZ = z >> leveledRegionShift
        let reg = this.mapProcessor.getLeveledRegion(caveLayer, mouseRegX, mouseRegZ, textureLevel)
        if (!reg || !reg.hasTextures()) return null

        let maxRegBlockCoord = (1 << leveledRegionShift) - 1
        let mouseRegPixelX = (x & maxRegBlockCoord) >> textureLevel
        let mouseRegPixelZ = (z & maxRegBlockCoord) >> textureLevel
        let debugTextureX = (x >> leveledRegionShift - 3) & 7
        let debugTextureY = (z >> leveledRegionShift - 3) & 7

        let tex = reg.getTexture(debugTextureX, debugTextureY)
        if (!tex) return null;

        let pixelInsideTexX = mouseRegPixelX & 63
        let pixelInsideTexZ = mouseRegPixelZ & 63
        return tex.getBiome(pixelInsideTexX, pixelInsideTexZ)
    }

    /** @returns {number} 每世界方块对应的屏幕像素 */
    scale() { return this.mapScale / Hud.getScaleFactor() }
    /** 世界长度 → 屏幕像素 @param {number} [length=1] @returns {number} */
    toSize(length) { return (length ?? 1) * this.scale() }
    /** 世界 X → 屏幕 X @param {number} x @returns {number} */
    toX(x) { return Math.round(this.width / 2 + this.toSize(x - this.cameraX)) }
    /** 世界 Z → 屏幕 Y @param {number} y @returns {number} */
    toY(y) { return Math.round(this.height / 2 + this.toSize(y - this.cameraZ)) }
    /** 世界长度 → 屏幕整数像素 @param {number} length @returns {number} */
    toLength(length) { return Math.round(this.toSize(length ?? 1)) }
    /** 鼠标屏幕 X @returns {number} */
    mouseX() { return this.toX(this.mouseBlockPosX) }
    /** 鼠标屏幕 Y @returns {number} */
    mouseY() { return this.toY(this.mouseBlockPosZ) }
}

// ==================== 事件 ====================
/**
 * @typedef {Packages.xyz.wagyourtail.jsmacros.api.math.Pos2D} type_pos2d
 * @typedef {Packages.xyz.wagyourtail.jsmacros.api.math.Vec2D} type_vec2d
 * @typedef {{timestamp:number,interval:number,mouse:type_pos2d}} eventCache
 * @typedef {'holding'|'pressed'|'released'} enum_keyState
 */
/** 事件 */
class Event {
    static DRAG_LIMIT = 1
    static DBCLICK_INTERVAL = 300
    static LEFTCLICK = 'key.mouse.left'
    static RIGHTCLICK = 'key.mouse.right'
    static MIDCLICK = 'key.mouse.middle'
    static SHIFT = 'key.keyboard.left.shift'
    static ALT = 'key.keyboard.left.alt'
    static KEY_H = 'key.keyboard.h'
    static cache = {}
    static latest = []
    /** @param {Key} key @param {eventCache} props */
    static update(key, props) { Event.cache[key] = { ...Event.cache[key], ...props } }
    constructor() {
        this.timestamp = Date.now()
        this.mouse = PositionCommon.createPos(Hud.getMouseX(), Hud.getMouseY())
        this.keys = Array.from(KeyBind.getPressedKeys())
        this.keyStates = {}
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
            } else if (wasPressed) {
                this.keyStates[key] = { state: 'released', cache: Event.cache[key] }
            }
        }
        Event.latest = [...this.keys]
    }
    /** @param {Key} [button=Event.LEFTCLICK] @returns {type_vec2d?} */
    drag(button = Event.LEFTCLICK) {
        let kv = this.keyStates[button]
        if (kv && kv.state == 'holding') {
            let vec = kv.cache.mouse.toReverseVector(this.mouse)
            if (vec.getMagnitude() > Event.DRAG_LIMIT) return vec
        }
        return null
    }
    /** @param {Key} [button=Event.LEFTCLICK] @returns {boolean} */
    click(button = Event.LEFTCLICK) {
        return this.keyStates[button]?.state == 'pressed'
    }
    /** @param {Key} [button=Event.LEFTCLICK] @returns {boolean} */
    dbclick(button = Event.LEFTCLICK) {
        let kv = this.keyStates[button]
        return kv?.state == 'pressed' && kv.cache?.interval > 0 && kv.cache?.interval <= Event.DBCLICK_INTERVAL
    }
    /** 停止事件 */
    stopPropagation() { this.consumed = true }
}

// ==================== 事件池 ====================
/** 事件池 */
class EventBus {
    constructor() {
        /** @type {any?} */ this.tick = null
        /** @type {Record<string, {handle:(event:Event)=>void, clickTimer?:number}>} */ this.events = {}
    }
    /** @returns {string} */
    static uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            let r = (Math.random() * 16) | 0
            let v = c === 'y' ? (r & 0x3) | 0x8 : r
            return v.toString(16)
        })
    }
    /** 启动 Tick 监听 */
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
                } catch (e) { }
            }
        }))
    }
    /** @param {(event:Event)=>void} handle @returns {string} */
    addListener(handle) {
        let key = `tick-${EventBus.uuid()}`
        this.events[key] = { handle: handle }
        return key
    }
    /** @param {(event:Event)=>void} handle @param {number} delay @param {string?} [customkey] @returns {string} */
    setTimeout(handle, delay, customkey) {
        let key = customkey ?? `once-${EventBus.uuid()}`
        if (key in this.events) return key
        this.events[key] = { handle: handle, clickTimer: Date.now() + delay }
        return key
    }
    /** @param {string?} key */
    remove(key) { if (key && key in this.events) delete this.events[key] }
    /** 停止 Tick 监听并清空所有事件 */
    stop() { if (this.tick) JsMacros.off(this.tick), this.tick = null; this.events = {} }
}

// ==================== 缓存 ====================
/**
 * @typedef {Object} OilStoreType
 * @property {string} path 缓存文件路径
 * @property {Object} data 缓存数据
 */
/** 油田缓存 */
const OilStore = {
    data: {
        timestamp: 0, time: '',
        OIL_CHUNK_INFINITE_THRESHOLD: 0,
        OIL_CHUNK_THRESHOLD: 0,
        OIL_CHUNK_SCALE: 0,
        dimensions: {}
    },
    path: () => {
        let id = World.getWorldIdentifier()
        let saveDir = file.getParent().replace(/config\\jsMacros.+/, '') + `saves/${id.replace('LOCAL_', '')}`
        return FS.exists(saveDir) ? `${saveDir}/data/cdgoil_cache.json` : `data/cdgoil_cache_${id}.json`
    },
    /** @returns {typeof OilStore} */
    load() {
        if (!FS.exists(this.path())) {
            this.data = {
                timestamp: Date.now(),
                time: new Date().toISOString(),
                OIL_CHUNK_INFINITE_THRESHOLD: CDGConfig.OIL_CHUNK_INFINITE_THRESHOLD.get(),
                OIL_CHUNK_THRESHOLD: CDGConfig.OIL_CHUNK_THRESHOLD.get(),
                OIL_CHUNK_SCALE: CDGConfig.OIL_CHUNK_SCALE.get(),
                dimensions: {}
            }
            this.save()
            return this
        }
        try {
            const raw = JSON.parse(FS.open(this.path()).read())
            if (!raw.dimensions) raw.dimensions = {}
            this.data = raw
        } catch (e) {
            this.data = {
                timestamp: Date.now(),
                time: new Date().toISOString(),
                OIL_CHUNK_INFINITE_THRESHOLD: CDGConfig.OIL_CHUNK_INFINITE_THRESHOLD.get(),
                OIL_CHUNK_THRESHOLD: CDGConfig.OIL_CHUNK_THRESHOLD.get(),
                OIL_CHUNK_SCALE: CDGConfig.OIL_CHUNK_SCALE.get(),
                dimensions: {}
            }
            this.save()
        }
        return this
    },
    /** @returns {string} */
    getDimension() { return World.getDimension() },
    /** @param {number} x @param {number} z @returns {string} */
    key(x, z) { return `${x} ${z}` },
    /** @param {number} x @param {number} z @returns {boolean} */
    has(x, z) {
        const dim = this.getDimension()
        return !!(this.data.dimensions[dim] && this.key(x, z) in this.data.dimensions[dim])
    },
    /** @param {number} x @param {number} z @returns {number?} */
    get(x, z) {
        const dim = this.getDimension()
        return this.data.dimensions[dim]?.[this.key(x, z)]
    },
    /** @param {number} x @param {number} z @param {number} oil */
    set(x, z, oil) {
        const dim = this.getDimension()
        if (!this.data.dimensions[dim]) this.data.dimensions[dim] = {}
        this.data.dimensions[dim][this.key(x, z)] = oil
    },
    /** 保存缓存 */
    save() {
        this.data.timestamp = Date.now()
        this.data.time = new Date().toISOString()
        this.data.OIL_CHUNK_INFINITE_THRESHOLD = CDGConfig.OIL_CHUNK_INFINITE_THRESHOLD.get()
        this.data.OIL_CHUNK_THRESHOLD = CDGConfig.OIL_CHUNK_THRESHOLD.get()
        this.data.OIL_CHUNK_SCALE = CDGConfig.OIL_CHUNK_SCALE.get()
        FS.open(this.path()).write(JSON.stringify(this.data))
    }
}

// ==================== 油量查询 ====================
const BiomeHelper = {
    minecraft: null, registryAccess: null, BIOME: null, registry: null,
    Registries: DeobfRef.Class(
        'net.minecraft.core.registries.Registries', 'net.minecraft.class_7924',
        'net.minecraft.registry.RegistryKeys', 'net.minecraft.src.C_256686_'),
    getRegistryAccess() {
        return new DeobfRef(this.minecraft.m_91403_()).call(
            'registryAccess|method_29091|getRegistryManager|m_105152_'.split('|'))
    },
    getHolder(biomeid) {
        this.minecraft ??= Client.getMinecraft()
        this.registryAccess ??= this.getRegistryAccess()
        this.BIOME ??= this.Registries.get('BIOME', 'field_41236', 'f_256952_')
        this.registry ??= new DeobfRef(this.registryAccess).invoke(
            DeobfRef.methodName('net.minecraft.core.RegistryAccess',
                'registry', 'method_33310', 'getOptional', 'm_6632_'),
            this.BIOME)?.orElse(null)
        return new DeobfRef(this.registry).call(['getHolder', 'method_40264', 'getEntry', 'm_203636_'],
            biomeid).orElse(null)
    }
}
/** 油量查询核心 */
const CDGOil = {
    /** @type {ServerLevel?} */
    level: null,
    worldmap: null,
    fullSampling: false,
    /** @returns {typeof CDGOil} */
    init() {
        this.level = this.getOverworld()
        OilStore.load()
        return this
    },
    /** @returns {ServerLevel} */
    getOverworld() {
        try {
            const mc = Client.getMinecraft()
            const server = Reflection.getClass('net.minecraft.client.Minecraft')
                .getDeclaredMethod('m_91092_').invoke(mc)
            return Reflection.getClass('net.minecraft.server.MinecraftServer')
                .getDeclaredMethod('m_129783_').invoke(server)
        } catch {
            return null
        }
    },
    /** @returns {bigint} */
    getSeed() { return new DeobfRef(this.level).call(['getSeed', 'method_8412', 'm_7328_']) },
    /** @param {number} x @param {number} z @returns {Holder<Biome>} */
    getNoiseBiome(x, z) {
        let biome
        if (this.level)
            biome = new DeobfRef(this.level).call(
                ['getUncachedNoiseBiome', 'method_22387', 'getGeneratorStoredBiome', 'm_203675_'],
                x >> 2, 64 >> 2, z >> 2)
        else {
            this.worldmap ??= new WorldMap(Hud.getOpenScreen())
            let biomeid = this.worldmap.getBiomeFromTexture(this.worldmap.caveLayer, x, z)
            if (!biomeid)
                FS.open('debug.txt').append(`${new Date().toLocaleString()} [${x},${z}] ${biomeid}\n`)
            biome = BiomeHelper.getHolder(biomeid)
        }
        return biome
    },
    /** @param {number} x @param {number} z @returns {number} */
    getBaseOilAmount(x, z) {
        Client.waitTick()
        return OilChunksSavedData.getBaseOilAmount(this.level, new ChunkPos(x, z))
    },
    /** @param {number} x @param {number} z @returns {number} */
    getBaseOilAmountFast(x, z, fullSampling) {
        let seed = this.level ? this.getSeed() : CUSTOM_SEED
        if (!seed) throw new Error('Not Found Seed')
        let px = x << 4, pz = z << 4
        let denytag = CDGTags?.DENY_OIL_BIOMES
        let oiltag = CDGTags?.OIL_BIOMES
        let isHighInOil = false
        if (fullSampling) {
            for (let dx = 0; dx < 16; dx++) {
                for (let dz = 0; dz < 16; dz++) {
                    let biome = this.getNoiseBiome(px + dx, pz + dz)
                    if (!biome) return -1
                    if (denytag && biome.containsTag(denytag)) return 0
                    if (oiltag && biome.containsTag(oiltag)) isHighInOil = true
                }
            }
            Client.waitTick()
        } else {
            let biome = this.getNoiseBiome(px + 8, pz + 8)
            if (!biome) return -1
            if (denytag && biome.containsTag(denytag)) return 0
            if (oiltag && biome.containsTag(oiltag)) isHighInOil = true
        }
        
        if ((isHighInOil && CDGConfig?.DISABLE_HIGH_OIL_CHUNKS?.get())
            || (!isHighInOil && CDGConfig?.DISABLE_NORMAL_OIL_CHUNKS?.get()))
            return 0

        let scale = CDGConfig.OIL_CHUNK_SCALE.get()
        let randomSource = RandomSource.call(['create', 'method_43049', 'm_216335_'], seed)
        let noise = PerlinNoise.call(['create', 'method_39127', 'm_230529_'], randomSource, [-2, -1, 0, 1])
        let n = new DeobfRef(noise).call(['getValue', 'method_15416', 'sample', 'm_75408_'], x * scale, 0, z * scale)
        let max = 7000000 * (isHighInOil ? CDGConfig.HIGH_OIL_MULTIPLIER.get() : CDGConfig.OIL_MULTIPLIER.get())
        let amount = Math.ceil(Math.pow((n + 1) / 1.6, 2) * max)
        if (amount < CDGConfig.OIL_CHUNK_THRESHOLD.get()) return 0
        if (amount > CDGConfig.OIL_CHUNK_INFINITE_THRESHOLD.get()) return 2147483647
        return amount
    },
    /** @param {number} x @param {number} z @returns {number} */
    getOilSmart(x, z) {
        if (stopRequested) throw new Error('Stop Scan')
        const fast = this.getBaseOilAmountFast(x, z, this.fullSampling)
        if (fast < CDGConfig.OIL_CHUNK_INFINITE_THRESHOLD.get()) return fast
        
        return this.level ? this.getBaseOilAmount(x, z) : this.getBaseOilAmountFast(x, z, true)
    },
    /** @param {number} cx @param {number} cz @param {number} innerRadius */
    fineScan(cx, cz, innerRadius) {
        const total = (innerRadius * 2 + 1) ** 2
        const startTime = Date.now()
        let done = 0, newCount = 0, cachedCount = 0
        for (let r = 0; r <= innerRadius; r++) {
            if (stopRequested) throw new Error('Stop Scan')
            this.scanRing(cx, cz, r, (n, c) => {
                if (n) newCount++
                if (c) cachedCount++
                done++
                this.renderProgress(done, total, cachedCount, startTime)
            })
            Client.waitTick()
        }
        this.renderProgress(done, total, cachedCount, startTime, true)
    },
    /** @param {number} cx @param {number} cz @param {number} r @param {(isNew:boolean, isCached:boolean)=>void} onChunk */
    scanRing(cx, cz, r, onChunk) {
        if (r === 0) { this.processChunk(cx, cz, onChunk); OilStore.save(); return }
        for (let x = cx - r; x <= cx + r; x++) this.processChunk(x, cz - r, onChunk)
        for (let x = cx - r; x <= cx + r; x++) this.processChunk(x, cz + r, onChunk)
        for (let z = cz - r + 1; z <= cz + r - 1; z++) this.processChunk(cx - r, z, onChunk)
        for (let z = cz - r + 1; z <= cz + r - 1; z++) this.processChunk(cx + r, z, onChunk)
        OilStore.save()
    },
    /** @param {number} x @param {number} z @param {(isNew:boolean, isCached:boolean)=>void} onChunk */
    processChunk(x, z, onChunk) {
        if (OilStore.has(x, z)) { onChunk(false, true); return }
        const oil = this.getOilSmart(x, z)
        if (oil >= 0) OilStore.set(x, z, oil)
        onChunk(true, false)
    },
    progress: { line1: '', line2: '', visible: false, onMap: false },
    /**
     * 渲染进度
     * @param {number} done
     * @param {number} total
     * @param {number} cachedCount
     * @param {number} startTime
     * @param {boolean} [finish=false]
     */
    renderProgress(done, total, cachedCount, startTime, finish = false) {
        const width = 10
        const ratio = done / total
        const filled = Math.round(width * ratio)
        const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
        const elapsed = (Date.now() - startTime) / 1000
        const elapsedStr = elapsed.toFixed(1)
        const l1 = `§e${bar} §f${done}/${total}`
        const l2 = finish ? `§a✓ §7缓存§f${cachedCount} §7耗时§f${elapsedStr}s` : `§7缓存§f${cachedCount} §7耗时§f${elapsedStr}s`
        this.progress.line1 = l1
        this.progress.line2 = l2
        this.progress.visible = true
        if (!this.progress.onMap)
            Chat.actionbar(finish ? `§a扫描完成 §7缓存§f${cachedCount} §7耗时§f${elapsedStr}s` : `${l1} §7${l2}`)
    },
    /** 隐藏进度 */
    hideProgress() { this.progress.visible = false }
}

// ==================== 全局实例 ====================
/** @type {XaeroOverlayManager?} */
let overlay = null
/** @type {OilMarker?} */
let marker = null
/** @type {EventBus?} */
let bus = null
/** @type {string?} */
let last_player_key = null
/** @type {string?} */
let screen_listener = null
/** @type {string?} */
let filter_listener = null
/** @type {string?} */
let progress_listener = null
/** @type {string?} */
let refresh_listener = null
/** @type {boolean} */
let scanning = false
/** @type {boolean} */
let stopRequested = false
/** @type {boolean} */
let onMapScreen = false
/** @type {WorldMap?} */
let currentGuimap = null

// ==================== 主逻辑 ====================
/** 主入口 */
function main() {
    bus = new EventBus()
    bus.start()

    OilMarkerState.init()
    CDGOil.init()
    overlay = new XaeroOverlayManager().register()
    marker = new OilMarker(overlay, OilStore)

    // 刷新驱动
    let refreshCounter = 0
    refresh_listener = bus.addListener(() => {
        if (++refreshCounter % (scanning ? 20 : REFRESH_INTERVAL_TICKS)!== 0) return
        if (!marker) return
        let center = getCurrentCenter()
        if (!center) return
        marker.updateNearestMask(center.cx, center.cz)
    })

    screen_listener = JsMacros.on('OpenScreen', JavaWrapper.methodToJava(() => {
        const screen = Hud.getOpenScreen()
        bus.remove(filter_listener)
        bus.remove(progress_listener)
        CDGOil.progress.onMap = false
        onMapScreen = false
        currentGuimap = null

        if (screen && Reflection.getClassName(screen) == 'xaero.map.gui.GuiMap') {
            CDGOil.progress.onMap = true
            onMapScreen = true
            const guimap = new WorldMap(screen)
            currentGuimap = guimap

            const regionW = guimap.width || (Hud.getWindowWidth() / Hud.getScaleFactor())
            const regionH = guimap.height || (Hud.getWindowHeight() / Hud.getScaleFactor())
            const baseY = regionH - 30
            const progressDraw = Hud.createDraw2D()
            const pLine1 = progressDraw.addText('', 20, baseY | 0, 0xFFFF00, true)
            const pLine2 = progressDraw.addText('', 20, (baseY + 13) | 0, 0xAAAAAA, true)
            screen.addDraw2D(progressDraw, 0, 0, regionW | 0, regionH | 0)

            progress_listener = bus.addListener(() => {
                if (!pLine1) return
                if (!CDGOil.progress.visible) {
                    pLine1.setText('')
                    pLine2.setText('')
                    return
                }
                pLine1.setText(CDGOil.progress.line1)
                pLine2.setText(CDGOil.progress.line2)
            })

            let tick_counter = 0
            filter_listener = bus.addListener(event => {
                const pressedKeys = event.keys
                if (pressedKeys.length == 0 && ++tick_counter % 3 !== 0) return
                tick_counter = 0

                if (event.click(Event.KEY_H) && pressedKeys.includes(Event.ALT)) {
                    const on = marker.toggle()
                    mclog(on ? '油田标记 §a开启' : '油田标记 §c关闭')
                    if (on) {
                        const c = getCurrentCenter()
                        if (c) marker.updateNearestMask(c.cx, c.cz)
                    }
                }

                if (event.click(Event.LEFTCLICK) && pressedKeys.includes(Event.ALT)) {
                    if (scanning) {
                        stopRequested = true
                        mclog('已请求中断扫描', 12)
                    } else {
                        let mx = guimap.mouseBlockPosX
                        let mz = guimap.mouseBlockPosZ
                        if (!Number.isFinite(mx) || !Number.isFinite(mz)) return
                        let cx = mx >> 4, cz = mz >> 4
                        startScan(cx, cz)
                    }
                }
            })
        }
    }))
}

/** @returns {ChunkCoord?} */
function getCurrentCenter() {
    if (onMapScreen && currentGuimap) {
        const mx = currentGuimap.mouseBlockPosX
        const mz = currentGuimap.mouseBlockPosZ
        if (Number.isFinite(mx) && Number.isFinite(mz)) {
            return { cx: Math.floor(mx / 16), cz: Math.floor(mz / 16) }
        }
    }
    const chunk = Player.getPlayer()?.getChunk()
    if (!chunk) return null
    return { cx: chunk.getChunkX(), cz: chunk.getChunkZ() }
}

/** @returns {string?} */
function getPlayerChunkKey() {
    const chunk = Player.getPlayer()?.getChunk()
    return chunk ? `${chunk.getChunkX()},${chunk.getChunkZ()}` : null
}

/** @param {number} cx @param {number} cz */
function startScan(cx, cz) {
    if (scanning) return
    scanning = true
    stopRequested = false
    CDGOil.progress.visible = true
    mclog(`开始扫描 §a(${cx}, ${cz}) §7半径 §a${SCAN_RADIUS}`)
    bus.setTimeout(() => {
        try {
            CDGOil.fineScan(cx, cz, SCAN_RADIUS)
        } catch (e) {
            if (`${e}`.indexOf('Stop Scan') < 0)
                mclog(`扫描异常 ${e}`, 12)
            else if (`${e}`.indexOf('Not Found Seed') < 0)
                mclog(`扫描异常 ${e}`, 12)
            else
                mclog('扫描已中断', 12)
        } finally {
            scanning = false
            stopRequested = false
            CDGOil.hideProgress()
            const c = getCurrentCenter()
            if (c && marker) marker.updateNearestMask(c.cx, c.cz)
            mclog('扫描结束')
        }
    }, 50, 'once-oil-scanner')
}

/** 清理 */
function teardown() {
    stopRequested = true
    scanning = false
    if (filter_listener) { bus?.remove(filter_listener); filter_listener = null }
    if (progress_listener) { bus?.remove(progress_listener); progress_listener = null }
    if (refresh_listener) { bus?.remove(refresh_listener); refresh_listener = null }
    if (screen_listener) { JsMacros.off(screen_listener); screen_listener = null }
    if (marker) { marker.clear(); marker = null }
    if (overlay) { overlay.unregister(); overlay = null }
    bus?.stop()
    Hud.clearDraw2Ds()
}

try {
    JsMacros.assertEvent(event, 'Service')
    event.stopListener = JavaWrapper.methodToJava(() => {
        _listener.off()
        toggleEnabled(false)
        teardown()
    })
    toggleEnabled(true)
} catch { toggleEnabled() }

if (isEnabled()) {
    main()
    _listener.step = 5
    _listener.on(() => {
        if (scanning) return
        const playerKey = getPlayerChunkKey()
        if (playerKey != null && playerKey !== last_player_key) {
            last_player_key = playerKey
            if (!onMapScreen) {
                const [pcx, pcz] = playerKey.split(',').map(Number)
                marker?.updateNearestMask(pcx, pcz)
            }
        }
    }).offHandle = () => { teardown() }
}
