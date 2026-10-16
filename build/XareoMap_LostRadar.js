// 脚本名称: 失落城市雷达数据
// 功能介绍: 在Xaero世界地图上显示失落城市雷达数据（鼠标悬停区块显示tooltip，Shift+左键标记已去过，自动记录有建筑的区块，H键切换标记渲染）
// 依赖模组: jsmacros、Xaero地图(Xaero's World Map、MiniMap)、失落城市雷达(LostRadar)
// 更新内容: v1.0 初始化脚本
// 更新内容: v1.1 自动记录停留过的建筑区块，允许添加为常驻服务脚本，修复未正确获取维度名
// 更新内容: v1.2 根据成就完成记录显示建筑是否已收集
// 更新内容: v1.3 H键切换标记显示，高亮显示出建筑标记状态，按存档名隔离存储数据，若已使用之前版本需要手动改为新文件名
// 更新内容: v1.4 大型建筑按 buildings 数量扩展相邻同名区块，手动标注和自动记录统一处理
// 更新内容: v1.5 大型建筑和普通建筑用不同纹理高亮
// 更新内容: v1.6 改用地图渲染管线，替代 Draw2D 手动绘制，兼容旧存储数据，统一存储到存档(单人)或者脚本目录(多人)

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

/** @type {JavaClass<ChunkPos>} */
const ChunkPos = Java.type('net.minecraft.world.level.ChunkPos')
/** @type {mcjty.lostradar.data.ClientMapData} @link {https://github.com/McJtyMods/LostRadar} */
const ClientMapData = Java.type('mcjty.lostradar.data.ClientMapData').getData()

/** 反射工具 @template T */
class DeobfRef {
    /** 探测类名
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
    /** @returns {JavaClass<any>} 父类 */
    get parent() { return this.class.getSuperclass() }

    /**
     * 获取第一个存在的字段名
     * @param {string[]} names 候选字段名（按优先级）
     * @returns {string?}
     */
    fieldName(...names) {
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
        let name = this.fieldName(...names)
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
        let name = this.fieldName(...names)
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
     * @returns {string?}
     */
    methodName(...method_names) {
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
        let name = this.methodName(...method_names)
        return name ? this.invoke(name, ...args) : null
    }
}
/** 长类名集中管理 */
const IMPORT = {
    // === Java 标准 ===
    Object: 'java.lang.Object',
    Double: 'java.lang.Double',
    Boolean: 'java.lang.Boolean',
    Float: 'java.lang.Float',
    String: 'java.lang.String',
    ArrayList: 'java.util.ArrayList',
    Collections: 'java.util.Collections',
    Iterator: 'java.util.Iterator',
    Function: 'java.util.function.Function',
    Throwable: 'java.lang.Throwable',
    // === MC 类（探测） ===
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
    // === Xaero 小地图 ===
    Minimap: 'xaero.minimap.XaeroMinimap',
    MiniLocation: 'xaero.hud.minimap.element.render.MinimapElementRenderLocation',
    MiniInfo: 'xaero.hud.minimap.element.render.MinimapElementRenderInfo',
    MiniProvider: 'xaero.hud.minimap.element.render.MinimapElementRenderProvider',
    MiniReader: 'xaero.hud.minimap.element.render.MinimapElementReader',
    MiniRenderer: 'xaero.hud.minimap.element.render.MinimapElementRenderer',
    MiniRendererHandler: 'xaero.hud.minimap.element.render.MinimapElementRendererHandler',
    MiniFBO: 'xaero.common.minimap.render.MinimapFBORenderer',
    MiniTextureProvider: 'xaero.common.graphics.renderer.multitexture.MultiTextureRenderTypeRendererProvider',
    // === Xaero 世界地图 ===
    WorldMap: 'xaero.map.WorldMap',
    WorldLocation: 'xaero.map.element.render.ElementRenderLocation',
    WorldInfo: 'xaero.map.element.render.ElementRenderInfo',
    WorldProvider: 'xaero.map.element.render.ElementRenderProvider',
    WorldReader: 'xaero.map.element.render.ElementReader',
    WorldRenderer: 'xaero.map.element.render.ElementRenderer',
    WorldTextureProvider: 'xaero.map.graphics.renderer.multitexture.MultiTextureRenderTypeRendererProvider',
}
/** 动态类构建工厂（小地图 + 世界地图） */
class ModBuilder {
    static package = 'xyz.wagyourtail.jsmacros.core.library.impl.classes.proxypackage.'
    static namespace = 'XaeroOverlay'
    static suffix = '' + `_${Date.now()}`

    /** 共用 Element 短名 */
    static Element = `${this.namespace}_Element${this.suffix}`
    static Context = `${this.namespace}_Context${this.suffix}`
    /** 小地图短名 */
    static MINIMAP = {
        Provider: `${this.namespace}_MinimapProvider${this.suffix}`,
        Reader: `${this.namespace}_MinimapReader${this.suffix}`,
        Renderer: `${this.namespace}_MinimapRenderer${this.suffix}`,
    }
    /** 世界地图短名 */
    static WORLDMAP = {
        Provider: `${this.namespace}_WorldMapProvider${this.suffix}`,
        Reader: `${this.namespace}_WorldMapReader${this.suffix}`,
        Renderer: `${this.namespace}_WorldMapRenderer${this.suffix}`,
    }

    static className(name) { return this.package + name }
    static load(name) { try { return Reflection.getClassFromClassBuilderResult(name) } catch { return null } }
    /** 构建类
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

    static createElementClass() {
        const name = this.Element
        const { String, Function } = IMPORT
        return this.load(name) ?? this.builder({
            name: name,
            fields: [
                `public int x;`,
                `public int z;`,
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
                `public boolean hasNext(${location} loc, ${Object} ctx) {
                    return this.iterator.hasNext();
                }`,
                `public ${Object} getNext(${location} loc, ${Object} ctx) {
                    return this.iterator.hasNext() ? this.iterator.next() : null;
                }`,
                `public void end(${location} loc, ${Object} ctx) {
                    this.iterator = ${Collections}.emptyIterator();
                }`,
            ]
        })
    }
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

    static createMinimapProviderClass() {
        return this.createProviderClass(this.MINIMAP.Provider,
            IMPORT.MiniProvider, IMPORT.MiniLocation)
    }
    static createMinimapReaderClass() {
        return this.createReaderClass(this.MINIMAP.Reader,
            IMPORT.MiniReader, IMPORT.MiniLocation)
    }
    static createMinimapRendererClass() {
        const name = this.MINIMAP.Renderer
        const {
            MiniRenderer, MiniLocation, MiniInfo, BufferSource, MiniTextureProvider,
            Object, GuiGraphics, Double, Boolean, Throwable
        } = IMPORT
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
                    } catch (${Throwable} t) {
                        return false;
                    }
                }`,
            ]
        })
    }

    static createWorldMapProviderClass() {
        return this.createProviderClass(this.WORLDMAP.Provider, IMPORT.WorldProvider, IMPORT.WorldLocation)
    }
    static createWorldMapReaderClass() {
        return this.createReaderClass(this.WORLDMAP.Reader, IMPORT.WorldReader, IMPORT.WorldLocation)
    }
    static createWorldMapRendererClass() {
        const name = this.WORLDMAP.Renderer
        const {
            WorldRenderer, WorldLocation, WorldInfo, BufferSource, WorldTextureProvider,
            Object, GuiGraphics, Double, Float, Boolean, Throwable
        } = IMPORT
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
                    } catch (${Throwable} t) {
                        return false;
                    }
                }`,
            ]
        })
    }
}
/** 渲染层管理器（小地图 + 世界地图） */
class XaeroOverlayManager {
    /** @typedef {net.minecraft.network.chat.Component} Component */
    constructor() {
        /** @type {JavaClass?} 共用类 */
        this.ElementCls = null
        /** @type {JavaClass?} 共用类 */
        this.ContextCls = null

        /** @type {boolean} 小地图是否已注册 */
        this.minimapInited = false
        /** @type {xaero.hud.minimap.element.render.over.MinimapElementOverMapRendererHandler?} 小地图Handler实例 */
        this.minimapHandler = null
        /** @type {object?} 小地图 Context 实例 */
        this.minimapContext = null
        /** @type {object?} 小地图 Renderer 实例 */
        this.minimapRenderer = null

        /** @type {boolean} 世界地图是否已注册 */
        this.worldMapInited = false
        /** @type {xaero.map.element.MapElementRenderHandler?} 世界地图Handler 实例 */
        this.worldMapHandler = null
        /** @type {object?} 世界地图 Context 实例 */
        this.worldMapContext = null
        /** @type {object?} 世界地图 Renderer 实例 */
        this.worldMapRenderer = null
    }

    /** 注册小地图渲染层 */
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
        mclog('小地图渲染层已注册')
        return this
    }
    /** 注册世界地图渲染层 */
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
        mclog('世界地图渲染层已注册')
        return this
    }

    /** 注册所有渲染层 */
    register() {
        this.ElementCls = ModBuilder.createElementClass()
        this.ContextCls = ModBuilder.createContextClass()
        this.registerMinimap()
        this.registerWorldMap()
        return this
    }
    /** 从渲染管线移除 */
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
     * @param {number} cx X
     * @param {number} cz Z
     * @param {number} [color=0x80FF0000] ARGB 颜色
     * @param {number} [size=16] 尺寸（方块单位）
     * @param {boolean} [large=false] 是否大型建筑
     * @param {Function?} [render=null] 元素渲染回调
     * @returns {object} 元素实例
     */
    addElement(cx, cz, color = 0x80FF0000, size = 16, large = false, render = null) {
        if (!this.minimapInited && !this.worldMapInited) throw new Error('XaeroOverlayManager 未 register')

        const ElementCls = this.ElementCls
        const el = Reflection.newInstance(ElementCls, cx | 0, cz | 0, color | 0, size | 0, !!large, render)
        this.minimapInited && this.minimapContext.elements.add(el)
        this.worldMapInited && this.worldMapContext.elements.add(el)
        return el
    }
    /**
     * 移除一个元素
     * @param {object} handle addElement 返回的元素实例
     * @returns {boolean} 是否移除成功
     */
    removeElement(handle) {
        if (!handle) return false
        let removed = false
        if (this.minimapInited) removed = this.minimapContext.elements.remove(handle) || removed
        if (this.worldMapInited) removed = this.worldMapContext.elements.remove(handle) || removed
        return removed
    }
    /** 清空所有元素 */
    clearElements() {
        this.minimapInited && this.minimapContext.elements.clear()
        this.worldMapInited && this.worldMapContext.elements.clear()
    }
    setEnabled(v) {
        if (this.minimapInited) this.minimapContext.enabled = v
        if (this.worldMapInited) this.worldMapContext.enabled = v
        return v
    }
    isEnabled() {
        return (this.minimapInited && this.minimapContext.enabled)
            || (this.worldMapInited && this.worldMapContext.enabled)
    }
    toggle() { return this.setEnabled(!this.isEnabled()) }
}

/** Draw2D拓展：支持裁剪画布+渲染提示框
 * @typedef {{x:int,y:int,width:int,height:int}} Region 显示区域
 * @typedef {net.minecraft.client.gui.DrawContext} DrawContext
 */
class Draw2DUtils {
    /** @type {net.minecraft.client.font.TextRenderer} */
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

    /**
     * 创建限制显示范围画布
     * @param {Region} region 显示区域
     * @param {(drawContext:DrawContext) => void} [onrender] 每帧渲染回调
     * @returns {Draw2D} 裁剪后的 Draw2D
     */
    static createDraw2D(region, onrender) {
        let builder = Reflection.createClassProxyBuilder(Draw2DUtils.Draw2D)
        let on = Draw2DUtils.DrawContext.methodName('enableScissor', 'method_44379', 'm_280588_')
        let off = Draw2DUtils.DrawContext.methodName('disableScissor', 'method_44380', 'm_280618_')
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
class WorldMap {
    /** @param {IScreen} screen */
    constructor(screen) {
        /** @type {IScreen} */ this.raw = screen
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
    /** @returns {string} 鼠标所在维度 */
    get mouseBlockDim() { return this.target.get('mouseBlockDim') }
    /** @returns {number} 相机中心世界 X 坐标 */
    get cameraX() { return this.target.get('cameraX') }
    /** @returns {number} 相机中心世界 Z 坐标 */
    get cameraZ() { return this.target.get('cameraZ') }

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

/** 事件
 * @typedef {Packages.xyz.wagyourtail.jsmacros.api.math.Pos2D} type_pos2d
 * @typedef {Packages.xyz.wagyourtail.jsmacros.api.math.Vec2D} type_vec2d
 * @typedef {{timestamp:number,interval:number,mouse:type_pos2d}} eventCache
 * @typedef {'holding'|'pressed'|'released'} enum_keyState
 */
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
    /** 更新缓存 @param {Key} key @param {eventCache} props */
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
    /** 获取拖拽向量 @param {Key} button 拖拽按键，默认左键 @returns {type_vec2d?} */
    drag(button = Event.LEFTCLICK) {
        let kv = this.keyStates[button]
        if (kv && kv.state == 'holding') {
            let vec = kv.cache.mouse.toReverseVector(this.mouse)
            if (vec.getMagnitude() > Event.DRAG_LIMIT) return vec
        }
        return null
    }
    /** 触发单击 @param {Key} button 触发按键，默认左键 @returns {boolean} */
    click(button = Event.LEFTCLICK) {
        return this.keyStates[button]?.state == 'pressed'
    }
    /** 触发双击 @param {Key} button 触发按键，默认左键 @returns {boolean} */
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
        /** @type {any?} JsMacros Tick 监听 id */
        this.tick = null
        /** @type {Record<string, {handle:(event:Event)=>void, clickTimer?:number}>} tick事件池 */
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
                    // Chat.log(`[EventBus] handler 异常: ${e}`)
                }
            }
        }))
    }
    /** 注册持续监听器
     * @param {(event:Event)=>void} handle 回调
     * @returns {string} 监听ID
     */
    addListener(handle) {
        let key = `tick-${EventBus.uuid()}`
        this.events[key] = { handle: handle }
        return key
    }
    /**
     * 注册一次性定时回调（到点触发后自动移除）
     * @param {(event:Event)=>void} handle 回调
     * @param {number} delay 延迟毫秒
     * @returns {string} 监听ID
     */
    setTimeout(handle, delay) {
        let key = `once-${EventBus.uuid()}`
        this.events[key] = { handle: handle, clickTimer: Date.now() + delay }
        return key
    }
    /** 移除监听 @param {string?} key 监听ID */
    remove(key) { if (key && key in this.events) delete this.events[key] }
    /** 停止Tick监听并清空所有事件 */
    stop() { if (this.tick) JsMacros.off(this.tick), this.tick = null; this.events = {} }
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

/** @returns {ClientLevel} 主世界 ClientLevel */
function getClientLevel() {
    return new DeobfRef(Client.getMinecraft()).get('level', 'field_1687', 'world', 'f_91073_')
}
/** @returns {string?} "cx,cz" 获取玩家当前所在区块 key */
function getPlayerChunkKey() {
    const chunk = Player.getPlayer()?.getChunk()
    return `${chunk.getChunkX()},${chunk.getChunkZ()}`
}
/**
 * 扩展相邻同名建筑区块
 * @param {number} cx 中心区块 X
 * @param {number} cz 中心区块 Z
 * @param {mcjty.lostradar.data.MapPalette$PaletteEntry} centerEntry 中心区块条目
 * @returns {string[]} 区块 key 列表（含自身）
 */
function expandSameBuilding(cx, cz, centerEntry) {
    const name = centerEntry.name()
    const visited = new Set([`${cx},${cz}`])
    if (!name.startsWith('multi_')) return Array.from(visited)

    const level = getClientLevel()
    const queue = [[cx, cz]]
    while (queue.length > 0) {
        const [x, z] = queue.shift()

        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
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

/**
 * 标记某区块所属建筑簇为已去过
 * @param {number} cx 中心区块 X
 * @param {number} cz 中心区块 Z
 * @param {string} dim 维度
 * @param {boolean} toggle 切换模式（true=已去过则取消，false=只标记）
 * @param {boolean} [actionBar=false] 是否用动作栏输出（自动记录用）
 * @returns {boolean} 是否实际发生了变更
 */
function markChunkAt(cx, cz, dim, toggle, actionBar = false) {
    let entry = null
    try { entry = ClientMapData.getPaletteEntry(getClientLevel(), new ChunkPos(cx, cz)) } catch (e) { }

    // 无雷达建筑：地图上无标记可画，不处理
    if (!entry || entry.buildings().size() === 0) return false

    const cluster = expandSameBuilding(cx, cz, entry)
    const allVisited = cluster.every(k => visitedStore.getTime(dim, k) != null)
    const targetState = toggle ? !allVisited : true
    let changed = 0
    for (const k of cluster) {
        const has = visitedStore.getTime(dim, k) != null
        if (targetState !== has) { visitedStore.toggle(dim, k); changed++ }
    }

    if (actionBar) {
        if (changed > 0) Chat.actionbar(`添加记录 §a${changed} §7个区块`)
    } else {
        mclog(targetState ? `已标记 §a${cluster.length} §7个区块` : `已取消 §c${cluster.length} §7个区块`)
    }
    return changed > 0
}

/** 标记状态（附带纹理初始化） */
const MarkerState = {
    /** @typedef {{color:number, texture:CustomImage?, largeTexture:CustomImage?}} MarkerStateDef 标记状态定义 */
    /** 未注册 + 未去过（红） */
    UNREGISTERED_UNVISITED: { color: 0xFF4444, texture: null, largeTexture: null },
    /** 未注册 + 已去过（橙） */
    UNREGISTERED_VISITED: { color: 0xFF8844, texture: null, largeTexture: null },
    /** 已注册 + 未去过（黄） */
    REGISTERED_UNVISITED: { color: 0xFFFF44, texture: null, largeTexture: null },
    /** 已注册 + 已去过（绿） */
    REGISTERED_VISITED: { color: 0x44FF44, texture: null, largeTexture: null },
    /** 预创建所有标记纹理 */
    init() {
        for (const [name, state] of Object.entries(this)) {
            if (typeof state !== 'object' || !('color' in state)) continue
            try {
                // 普通建筑
                state.texture = Hud.createTexture(16, 16, `lostradar_marker_${name}`)
                    .setGraphicsColor(0x000000).fillRect(1, 1, 14, 14)
                    .setGraphicsColor(state.color).drawRoundRect(0, 0, 15, 15, 8, 8)
                    .drawRoundRect(3, 3, 9, 9, 8, 8).setXorMode(0x000000).drawRect(0, 0, 15, 15)
                    .update()
                // 大型建筑
                state.largeTexture = Hud.createTexture(16, 16, `lostradar_marker_large_${name}`)
                    .setGraphicsColor(0x000000).fillRect(0, 0, 15, 15)
                    .setGraphicsColor(state.color).drawRoundRect(0, 0, 15, 15, 16, 16)
                    .drawRoundRect(3, 3, 9, 9, 8, 8).drawRect(0, 0, 15, 15)
                    .update()
            } catch (e) {
                // Chat.log(`§c[雷达] 纹理创建失败 ${name}: ${e}`)
            }
        }
    }
}

/** 已去过区块存储 */
class VisitedStore {
    /**
     * @param {string|string[]|() => string|string[]} readPaths 读取路径（按优先级）
     * @param {string|() => string} [writePath] 写入路径；不传则用读取路径第一个
     */
    constructor(readPaths, writePath) {
        /** @type {string|string[]|() => string|string[]} */ this._readPaths = readPaths
        /** @type {string|() => string|undefined} */ this._writePath = writePath
        /** @type {Object<string, Object<string, number>>?} 维度 → { 区块key: 时间戳 } */
        this.cache = null
    }

    /** @returns {string[]} 读取路径列表（按优先级） */
    get readPaths() {
        let v = typeof this._readPaths == 'function' ? this._readPaths() : this._readPaths
        return Array.isArray(v) ? v : [v]
    }

    /** @returns {string} 写入路径 */
    get path() {
        let p = this._writePath ?? this._readPaths
        return typeof p == 'function' ? p() : (Array.isArray(p) ? p[0] : p)
    }

    /** 从本地文件加载 @returns {Object<string, Object<string, number>>} */
    load() {
        if (this.cache) return this.cache
        this.cache = {}
        for (const p of this.readPaths) {
            try {
                if (FS.exists(p)) {
                    const raw = FS.open(p).read()
                    if (raw && raw.length > 0) {
                        this.cache = JSON.parse(raw)
                        // 读的不是写入路径 → 迁移到写入路径
                        if (p !== this.path && Object.keys(this.cache).length > 0) {
                            mclog(`迁移记录 §a${p} §7→ §a${this.path}`)
                            this.save()
                        }
                        break
                    }
                }
            } catch (e) {
                // Chat.log(`§c[雷达] 加载 ${p} 失败: ${e}`)
            }
        }
        return this.cache
    }

    /** 保存到本地文件 */
    save() {
        if (!this.cache) return
        try {
            const dir = this.path.substring(0, this.path.lastIndexOf('/'))
            if (!FS.exists(dir)) FS.makeDir(dir)
            FS.open(this.path).write(JSON.stringify(this.cache))
        } catch (e) {
            // Chat.log(`§c[雷达] 保存已去过记录失败: ${e} ${this.path}`)
        }
    }

    /**
     * 获取某维度某区块的记录时间戳
     * @param {string} dim
     * @param {string} chunkKey "cx,cz"
     * @returns {number?}
     */
    getTime(dim, chunkKey) { return this.load()[dim]?.[chunkKey] ?? null }

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
    static utils = DeobfRef.Type('xaero.hud.minimap.config.util.MinimapConfigClientUtils')
    static settings = DeobfRef.Type('xaero.minimap.XaeroMinimap')?.instance?.getSettings()
    static minimap = Java.type('xaero.hud.minimap.BuiltInHudModules').MINIMAP
    /**
     * @param {XaeroOverlayManager} overlay 渲染层管理器
     * @param {DCAdvancement} adv 进度查询
     * @param {VisitedStore} store 已去过存储
     */
    constructor(overlay, adv, store) {
        /** @type {XaeroOverlayManager} */ this.overlay = overlay
        /** @type {Map<string, object>} */ this.elements = new Map()
        /** @type {DCAdvancement} */ this.adv = adv
        /** @type {VisitedStore} */ this.store = store
        /** @type {string?} */ this.lastSyncKey = null
        /** @type {Draw2D} */ this.d2d = Hud.createDraw2D()
        /** @type {boolean} 渲染开关 */
        this.enabled = GlobalVars.getBoolean(`${scriptName}:Hightlight`)
        /** @type {string} render方法名 */
        this.render = DeobfRef.methodName(IMPORT.Renderable, 'render', 'method_25394', 'm_88315_')
    }
    /** 清空所有标记 */
    clear() {
        for (const [k, h] of this.elements) this.overlay.removeElement(h)
        this.elements.clear()
        this.lastSyncKey = null
    }
    /**
     * 判断某区块的标记状态
     * @param {mcjty.lostradar.data.MapPalette$PaletteEntry} entry
     * @param {number} cx
     * @param {number} cz
     * @param {string} dim
     * @returns {{state:MarkerStateDef, isLarge:boolean}?} 状态 + 是否大型建筑；null=不显示
     */
    stateOf(entry, cx, cz, dim) {
        const buildings = Array.from(entry.buildings())
        if (buildings.length === 0) return null
        const registered = this.adv.isDone(buildings[0])
        const visited = this.store.getTime(dim, `${cx},${cz}`) != null
        let state
        if (registered && visited) state = MarkerState.REGISTERED_VISITED
        else if (registered && !visited) state = MarkerState.REGISTERED_UNVISITED
        else if (!registered && visited) state = MarkerState.UNREGISTERED_VISITED
        else state = MarkerState.UNREGISTERED_UNVISITED
        return { state, isLarge: entry.name().startsWith('multi_') }
    }
    /**
     * @param {boolean} isLarge
     * @param {MarkerStateDef} state 已算好的状态（由 rebuild 传入）
     * @returns {Function}
     */
    makeRender(isLarge, state) {
        const self = this
        return JavaWrapper.methodToJava((args) => {
            try {
                const [graphics, e, info, localX, localY, scale, isWorldMap, hovered] = args
                const tex = isLarge ? state.largeTexture : state.texture
                if (!tex) return false
                let mapSize = RadarMarker.minimap.getCurrentSession().getProcessor().getMinimapSize()
                const isLocked = (RadarMarker.settings?.getLockNorth(mapSize / 2, RadarMarker.settings.minimapShape))
                    || (RadarMarker.utils?.getEffectiveNorthLocked(mapSize/ 2, 0))
                const half = (e.size / 2) * scale
                const deg = isWorldMap ? 0 : isLocked ? 0 : -90 - (Player.getPlayer().getYaw() ?? 0)
                const img = self.d2d.imageBuilder()
                    .fromCustomImage(tex).alpha(isWorldMap ? 200 : 180)
                    .pos((localX - half) | 0, (localY - half) | 0)
                    .size(Math.max(2, (half * 2) | 0), Math.max(2, (half * 2) | 0))
                    .rotation(deg).rotateCenter(true)
                    .build()
                img[self.render](graphics, 0, 0, 0)
            } catch (err) { mclog(`[地图渲染管线] ${err} [${RadarMarker.settings}] [${RadarMarker.utils}]`, 12) }
            return true
        })
    }
    /**
     * 同步 element 列表到指定中心区块周边
     * @param {number} ccx 中心区块 X
     * @param {number} ccz 中心区块 Z
     * @param {string} dim
     * @param {boolean} force 强制重建
     * @param {number} radius 重建半径
     */
    rebuild(ccx, ccz, dim, force = false, radius) {
        adv.loads()
        const syncKey = `${dim}|${ccx},${ccz}`
        if (!force && syncKey === this.lastSyncKey) return
        this.lastSyncKey = syncKey

        if (!this.enabled) return this.clear()
        if (force) {
            for (const [k, h] of this.elements) this.overlay.removeElement(h)
            this.elements.clear()
        }
        /** @type {Map<string, {entry:any, isLarge:boolean}>} */
        const want = new Map()
        const level = getClientLevel()
        let RADIUS = radius ?? MARKER_RADIUS
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
            for (let dz = -RADIUS; dz <= RADIUS; dz++) {
                const cx = ccx + dx
                const cz = ccz + dz
                const k = `${cx},${cz}`
                let entry = ClientMapData.getPaletteEntry(level, new ChunkPos(cx, cz))
                if (!entry) continue
                const st = this.stateOf(entry, cx, cz, dim)
                if (!st) continue
                want.set(k, { entry, isLarge: st.isLarge, state: st.state })
            }
        }
        // 移除不在 want 的
        for (const [k, h] of Array.from(this.elements)) {
            if (!want.has(k)) {
                this.overlay.removeElement(h)
                this.elements.delete(k)
            }
        }
        // 添加新增的
        for (const [k, { entry, isLarge, state }] of want) {
            if (this.elements.has(k)) continue
            const [cx, cz] = k.split(',').map(Number)
            const size = isLarge ? 16 : 14
            const el = this.overlay.addElement(cx, cz, state.color, size, isLarge, this.makeRender(isLarge, state))
            this.elements.set(k, el)
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
    /** @param {DCAdvancement} adv @param {VisitedStore} store */
    constructor(adv, store) {
        /** @type {DCAdvancement} */ this.adv = adv
        /** @type {VisitedStore} */ this.store = store
    }

    /**
     * 构建带雷达数据的 tooltip
     * @param {mcjty.lostradar.data.MapPalette$PaletteEntry} entry
     * @param {number} cx @param {number} cz @param {string} dim
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
     * @param {number} cx @param {number} cz
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

function main() {
    overlay = new XaeroOverlayManager().register()
    marker = new RadarMarker(overlay, adv, visitedStore)

    // 从当前玩家位置初始化一次
    const pk = getPlayerChunkKey()
    if (pk) {
        const [pcx, pcz] = pk.split(',').map(Number)
        const dim = World.getDimension()
        marker.rebuild(pcx, pcz, dim)
    }

    screen_listener = JsMacros.on('OpenScreen', JavaWrapper.methodToJava(() => {
        const screen = Hud.getOpenScreen()
        bus.remove(filter_listener)
        tipDraw = null

        if (screen && Reflection.getClassName(screen) == 'xaero.map.gui.GuiMap') {
            adv.loads()
            const guimap = new WorldMap(screen)
            // ==================== tooltip 专用画布（独立于标记开关） ====================
            const tipRegion = {
                x: 0, y: 0,
                width: guimap.width || (Hud.getWindowWidth() / Hud.getScaleFactor()),
                height: guimap.height || (Hud.getWindowHeight() / Hud.getScaleFactor())
            }
            tipDraw = new Draw2DUtils(tipRegion, (self, drawContext) => {
                try {
                    if (!drawContext) return
                    const cx = Math.floor(guimap.mouseBlockPosX / 16)
                    const cz = Math.floor(guimap.mouseBlockPosZ / 16)
                    const dim = World.getDimension()
                    let lines = []
                    let entry = ClientMapData.getPaletteEntry(getClientLevel(), new ChunkPos(cx, cz))
                    if (entry) {
                        lines = radarTooltip.build(entry, cx, cz, dim)
                    } else {
                        const vt = visitedStore.getTime(dim, `${cx},${cz}`)
                        if (vt != null) lines = radarTooltip.buildVisitedOnly(cx, cz, vt)
                    }
                    self.tooltips = lines
                } catch (err) { mclog(`[Draw2D渲染管线] ${err}`, 12) }
            })
            screen.addDraw2D(tipDraw.target, 0, 0, tipRegion.width, tipRegion.height)

            // ==================== 按键监听 ====================
            /** @type {string?} 上次查询的区块 key */
            let last_key = null
            let tick_counter = 0

            filter_listener = bus.addListener(event => {
                const pressedKeys = event.keys
                if (pressedKeys.length == 0 && ++tick_counter % 3 !== 0) return
                tick_counter = 0

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
                    if (on) marker.rebuild(cx, cz, dim, true)
                }

                // ---- Shift+左键：切换已去过状态 ----
                if (event.click(Event.LEFTCLICK) && pressedKeys.includes(Event.SHIFT)) {
                    if (markChunkAt(cx, cz, dim, true)) {
                        last_key = null
                        marker.rebuild(cx, cz, dim, true)
                    }
                }

                // ---- 鼠标换区块：重建周边 element ----
                if (key !== last_key) {
                    last_key = key
                    marker.rebuild(cx, cz, dim)
                }
            })
        }
    }))
    interact_listener = JsMacros.on("InteractBlock", JavaWrapper.methodToJava((e, ctx) => {
        try {
            const id = `${e.block.getId()}`
            const catalog = 'deceasedcraft:building_catalog'
            const mainHand = Player.getPlayer().getMainHand().getItemId()
            const pos = e.block.getBlockPos()
            const cx = pos.getX() >> 4
            const cz = pos.getZ() >> 4
            const dim = World.getDimension()
            if (mainHand == catalog || /lootr_/.test(id)) {
                markChunkAt(cx, cz, dim, false, true)
                const entry = ClientMapData.getPaletteEntry(getClientLevel(), new ChunkPos(cx, cz))
                if (entry) {
                    const buildings = Array.from(entry.buildings())
                    if (buildings.length > 0 && !adv.isDone(buildings[0]))
                        mclog('此建筑尚未注册')
                }
                marker?.rebuild(cx, cz, dim, true, 5)
            }
        } catch (err) { mclog(`[开箱标记] ${err}`, 12) }
    }))
}

/** 清理 */
function teardown() {
    if (marker) { marker.clear(); marker = null }
    if (overlay) { overlay.unregister(); overlay = null }
    tipDraw = null
}

// ==================== 全局实例 ====================
/** 渲染半径（区块） */
const MARKER_RADIUS = 30
const bus = new EventBus()
const adv = new DCAdvancement()
const visitedStore = new VisitedStore(
    // 读取路径（按优先级：存档内新路径 → 带存档 ID 旧路径 → 通用旧路径）
    () => {
        const id = World.getWorldIdentifier()
        const saveDir = file.getParent().replace(/config\\jsMacros.+/, '') + `saves/${id.replace('LOCAL_', '')}`
        const paths = []
        if (FS.exists(saveDir)) paths.push(`${saveDir}/data/lostradar_visited.json`)
        paths.push(`data/lostradar_visited_${id}.json`)
        paths.push(`lostradar_visited_${id}.json`)
        paths.push(`lostradar_visited.json`)
        return paths
    },
    // 写入路径（统一放存档内；存档不存在则回退）
    () => {
        const id = World.getWorldIdentifier()
        const saveDir = file.getParent().replace(/config\\jsMacros.+/, '') + `saves/${id.replace('LOCAL_', '')}`
        return FS.exists(saveDir) ? `${saveDir}/data/lostradar_visited.json` : `data/lostradar_visited_${id}.json`
    }
)
const radarTooltip = new RadarTooltip(adv, visitedStore)
// ==================== 主逻辑 ====================
/** @type {string?} OpenScreen 监听 id */
let screen_listener = null
/** @type {string?} filter_listener 监听 id */
let filter_listener = null
/** @type {string?} InteractBlock 监听 id */
let interact_listener = null
/** @type {string?} 上次记录的玩家所在区块 key（自动记录用） */
let last_player_key = null
/** @type {XaeroOverlayManager?} */
let overlay = null
/** @type {RadarMarker?} */
let marker = null
/** @type {Draw2DUtils?} tooltip 专用画布 */
let tipDraw = null

try {
    JsMacros.assertEvent(event, 'Service')
    event.stopListener = JavaWrapper.methodToJava(() => { _listener.off(); toggleEnabled(false); })
    toggleEnabled(true)
} catch { toggleEnabled() }

if (isEnabled()) {
    bus.start()
    MarkerState.init()
    main()
    _listener.step = 5
    _listener.on(() => {
        const playerKey = getPlayerChunkKey()
        if (playerKey != null && playerKey !== last_player_key) {
            last_player_key = playerKey
            const [pcx, pcz] = playerKey.split(',').map(Number)
            const dim = World.getDimension()
            marker?.rebuild(pcx, pcz, dim, true, 5)
        }
    }).offHandle = () => {
        teardown()
        bus?.stop()
        Hud?.clearDraw2Ds()
        screen_listener && JsMacros.off(screen_listener)
        interact_listener && JsMacros.off(interact_listener)
    }
}
