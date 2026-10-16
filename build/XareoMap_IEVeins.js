// 脚本名称: 沉浸工程矿脉预览
// 功能介绍: 借助 Xaero 自定义渲染层，在小地图和世界地图上显示沉浸工程矿脉
// 依赖模组: jsmacros、Xaero小地图、Xaero世界地图、沉浸工程(Immersive Engineering)
// 更新内容: v1.0 初始化脚本
// 更新内容: v1.1 在世界地图添加Draw2D画布，渲染矿脉
// 更新内容: v1.2 改为注册自定义地图渲染层
// 更新内容: v1.3 渲染层类构造代码复用

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

/** @returns {ClientLevel} */
const clientLevel = () => new DeobfRef(Client.getMinecraft()).get('level', 'field_1687', 'world', 'f_91073_')

/** 反射工具 @template T */
class DeobfRef {
    /** 探测类名
     * @param {string[]} names 候选名
     * @returns {string|null}
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
     * @returns {string|null}
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
     * @returns {string|null}
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
     * @returns {string|null}
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
     * @returns {string|null}
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
    static namespace = 'IeVeinOverlay'
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

    static load(name) { try { return Reflection.getClassFromClassBuilderResult(name) } catch { return null } }
    static className(name) { return this.package + name }
    /** 构建类
     * @template {string} C
     * @param {{ name:C, extend:string, fields:string[], constructors:string[], methods:string[] }} opts 
     * @returns {JavaClass<C>}
     */
    static builder(opts) {
        const { name, extend, fields, constructors, methods } = opts
        let builder = Reflection.createClassBuilder(name, Java.type(extend ?? 'java.lang.Object'))
        fields && fields?.forEach(v => builder.addField(v))
        constructors && constructors?.forEach(v => builder.addConstructor(v))
        methods && methods?.forEach(v => builder.addMethod(v))
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
                `public int radius = 8;`,
                `public int depletion = 0;`,
                `public String mineral = "";`,
                `public String icon = "minecraft:stone";`,
                `public ${Function} render = null;`,
            ],
            constructors: [`public ${name}(int x, int z, int color, int size, ${Function} render) {
                this.x = x; this.z = z; this.color = color; this.size = size; this.render = render;
            }`],
            methods: [
                `public double centerX() { return (this.x + 0.5) * 1.0; }`,
                `public double centerZ() { return (this.z + 0.5) * 1.0; }`,
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
        const MINI_MAX_DIST = 128
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
                        double maxDistSq = java.lang.Math.pow(${MINI_MAX_DIST} * 1.0, 2.0);
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
                `public int getOrder() { return 100; }`,
                `public void preRender(${MiniInfo} info, ${BufferSource} buf, ${MiniTextureProvider} tex) {
                    ((${context}) this.context).scale = xaero.common.HudMod.INSTANCE.getMinimap().getMinimapFBORenderer().getZoom();
                }`,
                `public void postRender(${MiniInfo} info, ${BufferSource} buf, ${MiniTextureProvider} tex) {}`,
                `public boolean renderElement(
                        ${Object} element, boolean hovered, boolean highlighted, double depth, float screenSizeBasedScale,
                        double localX, double localY, ${MiniInfo} info, ${GuiGraphics} graphics, ${BufferSource} buf) {
                    if (!((${context}) this.context).enabled) return false;
                    ${element} el = (${element}) element;
                    if (el.render == null) return false;
                    double scale = ((${context}) this.context).scale;
                    try {
                        ${Object}[] args = new ${Object}[] {
                            graphics, el, info,
                            ${Double}.valueOf(localX),
                            ${Double}.valueOf(localY),
                            ${Double}.valueOf(scale),
                            ${Boolean}.FALSE,
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
    static createWorldMapProviderClass() {
        return this.createProviderClass(this.WORLDMAP.Provider,
            IMPORT.WorldProvider, IMPORT.WorldLocation)
    }
    static createWorldMapReaderClass() {
        return this.createReaderClass(this.WORLDMAP.Reader,
            IMPORT.WorldReader, IMPORT.WorldLocation)
    }
    static createWorldMapRendererClass() {
        const name = this.WORLDMAP.Renderer
        const {
            WorldRenderer, WorldLocation, WorldInfo, BufferSource, WorldTextureProvider,
            Object, Boolean, Double, GuiGraphics, Throwable
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
                `public int getOrder() { return 200; }`,
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
                        double scale = ((${context}) this.context).scale;
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
/** 渲染层管理器（小地图 + 世界地图） */
class XaeroOverlayManager {
    constructor() {
        /** @type {JavaClass|null} 共用类 */
        this.ElementCls = null
        /** @type {JavaClass|null} 共用类 */
        this.ContextCls = null

        /** @type {boolean} 小地图是否已注册 */
        this.minimapInited = false
        /** 小地图OverMapRendererHandler实例
         * @type {xaero.hud.minimap.element.render.over.MinimapElementOverMapRendererHandler|null} */
        this.minimapHandler = null
        /** @type {object|null} 小地图 Renderer 实例 */
        this.minimapRenderer = null
        /** @type {object|null} 小地图 Context 实例 */
        this.minimapContext = null

        /** @type {boolean} 世界地图是否已注册 */
        this.worldMapInited = false
        /** 世界地图 MapElementRenderHandler 实例
         * @type {xaero.map.element.MapElementRenderHandler|null} */
        this.worldMapHandler = null
        /** @type {object|null} 世界地图 Renderer 实例 */
        this.worldMapRenderer = null
        /** @type {object|null} 世界地图 Context 实例 */
        this.worldMapContext = null
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
            try {
                const cls = Reflection.getClass(IMPORT.MiniRendererHandler)
                const f = Reflection.getDeclaredField(cls, 'renderers')
                f.setAccessible(true)
                f.get(this.minimapHandler).remove(this.minimapRenderer)
            } catch (e) { mclog(`小地图卸载异常: ${e}`, 0xc) }
            this.minimapInited = false
            this.minimapRenderer = null
            this.minimapContext = null
        }

        if (this.worldMapInited) {
            try {
                const f = this.worldMapHandler.getClass().getDeclaredField('renderers')
                f.setAccessible(true)
                if (f != null) f.get(this.worldMapHandler).remove(this.worldMapRenderer)
            } catch (e) { mclog(`世界地图卸载异常: ${e}`, 0xc) }
            this.worldMapInited = false
            this.worldMapRenderer = null
            this.worldMapContext = null
        }

        mclog('渲染层已卸载')
        return true
    }

    /**
     * 添加一个矿脉元素
     * @param {number} cx X
     * @param {number} cz Z
     * @param {number} color ARGB 颜色
     * @param {number} size 尺寸（方块单位，直径）
     * @param {Function} render 元素渲染回调
     * @param {{radius:number, depletion:number, mineral:string, icon:string}} [extra=null] 矿脉附加数据
     * @returns {object[]} [小地图元素, 世界地图元素]（可能为 null）
     */
    addElement(cx, cz, color = 0x80FF0000, size = 16, render = null, extra = null) {
        if (!this.minimapInited && !this.worldMapInited) throw new Error('XaeroOverlayManager 未 register')
        const out = []
        const el = Reflection.newInstance(this.ElementCls, cx | 0, cz | 0, color | 0, size | 0, render)
        if (extra) {
            el.radius = extra.radius | 0
            el.depletion = extra.depletion | 0
            el.mineral = extra.mineral ?? ""
            el.icon = extra.icon ?? "minecraft:stone"
        }
        if (this.minimapInited) {
            this.minimapContext.elements.add(el)
            out.push(el)
        }
        if (this.worldMapInited) {
            this.worldMapContext.elements.add(el)
            out.push(el)
        }
        return out
    }

    /**
     * 移除一个或多个元素
     * @param {object|object[]|null} handle addElement 的返回值
     * @returns {boolean} 是否移除成功
     */
    removeElement(handle) {
        if (!handle) return false
        const arr = Array.isArray(handle) ? handle : [handle]
        let removed = false
        for (const h of arr) {
            if (!h) continue
            if (this.minimapInited) removed = this.minimapContext.elements.remove(h) || removed
            if (this.worldMapInited) removed = this.worldMapContext.elements.remove(h) || removed
        }
        return removed
    }

    /** 清空所有元素 */
    clearElements() {
        if (this.minimapInited) this.minimapContext.elements.clear()
        if (this.worldMapInited) this.worldMapContext.elements.clear()
    }

    setEnabled(v) {
        if (this.minimapInited) this.minimapContext.enabled = !!v
        if (this.worldMapInited) this.worldMapContext.enabled = !!v
        return v
    }
    isEnabled() {
        return (this.minimapInited && this.minimapContext.enabled) || (this.worldMapInited && this.worldMapContext.enabled)
    }
    toggle() { this.setEnabled(!this.isEnabled()) }

    /**
     * 判断窗口是否为地图界面
     * @param {IScreen} screen
     * @returns {boolean}
     */
    static isWorldMap(screen) { return screen && Reflection.getClassName(screen) == 'xaero.map.gui.GuiMap' }
    /**
     * 转化地图坐标为屏幕坐标
     * @param {number} x
     * @param {number} y
     * @param {number?} scale 缩放
     * @returns {{x:number,y:number,scale:number}}
     */
    static toScreenPosition(x, y, scale) {
        let screen = Hud.getOpenScreen()
        if (!this.isWorldMap(screen)) return null
        let ref = Reflection.getReflect(screen)
        let baseScale = Hud.getScaleFactor()
        let width = Hud.getWindowWidth() / baseScale
        let height = Hud.getWindowHeight() / baseScale

        let cameraX = ref.get('cameraX')
        let cameraZ = ref.get('cameraZ')
        let finalScale = (scale ?? ref.get('scale')) / baseScale

        let ox = width / 2 + (x - cameraX) * finalScale
        let oz = height / 2 + (y - cameraZ) * finalScale
        return { x: ox, y: oz, scale: finalScale }
    }
    /**
     * 判断鼠标是否悬停在坐标附近
     * @param {number} x
     * @param {number} y
     * @param {number} radius 半径
     * @param {number?} scale 缩放
     * @returns {boolean}
     */
    static isHovered(x, y, radius, scale) {
        let pos = this.toScreenPosition(x, y, scale)
        if (!pos) return false
        const r = Math.min(Math.max(10, radius * pos.scale), 20)
        let dx = Hud.getMouseX() - pos.x
        let dy = Hud.getMouseY() - pos.y
        return dx * dx + dy * dy <= r * r
    }
    /** @type {net.minecraft.client.gui.Font} */
    static Font = new DeobfRef(Client.getMinecraft())
        .get('font', 'field_1772', 'textRenderer', 'f_91114_', 'f_91062_')
    /** 气泡提示框内容组件
     * @param {string[]} tooltips 
     * @returns {JavaArray<Component>}
     */
    static toToolTipComponents(tooltips) {
        let arr = JavaUtils.createArrayList()
        for (let v of tooltips)
            arr.add(Chat.createTextHelperFromString(v).getRaw())
        return arr
    }
    /**
     * 绘制气泡提示框
     * @param {net.minecraft.client.gui.GuiGraphics} graphics 画板
     * @param {int} x 坐标
     * @param {int} y 坐标
     * @param {JavaArray<Component>} components 格式化文本列表
     */
    static renderToolTip(graphics, x, y, components) { Draw2DUtils.renderToolTip(graphics, x, y, components) }
}

/** 事件 */
class Event {
    /** @constant @type {number} 判定属于拖拽的鼠标最短拖拽距离 */
    static DRAG_LIMIT = 1
    /** @constant @type {number} 判定双击的最长间隔(ms) */
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
        /** @type {Record<string, {handle:(event:Event)=>{}, clickTimer?:number}>} tick事件池 */
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
     * @param {(event:Event)=>{}} handle 回调
     * @returns {string} 监听ID
     */
    addListener(handle) {
        let key = `tick-${EventBus.uuid()}`
        this.events[key] = { handle: handle }
        return key
    }
    /**
     * 注册一次性定时回调（到点触发后自动移除）
     * @param {(event:Event)=>{}} handle 回调
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
/** Draw2D 拓展：支持裁剪画布 + 渲染提示框 */
class Draw2DUtils {
    /** @typedef {{x:int,y:int,width:int,height:int}} Region 显示区域 */
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
                dcref.call(method, this.TextRenderer, components, Math.round(x), Math.round(y))
                dcref.call(['renderDeferredElements', 'method_73199', 'drawDeferredElements', 'm_280637_'])
            } catch {
                dcref.call(method, this.TextRenderer, components, Math.round(x), Math.round(y),
                    Player.getPlayer().getMainHand().getRaw())
            }
        }
    }
    /**
     * @param {Region} region 区域
     * @param {(self:Draw2DUtils,drawContext:DrawContext) => void} [onrender] 渲染事件
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
/** 多选框（过滤面板） */
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
     * @param {number} [opts.checkColor=0x55FF55] 勾选色（无对应配色时的回退）
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
     * @param {Record<string, number>} [opts.colors] 勾选填充色 key → 0xRRGGBB
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

        /** @type {Record<string, number>} key → 0xRRGGBB 颜色 */
        this.colors = Object.assign({}, opts.colors || {})

        this.onChange = opts.onChange || null
        this.overlay = null
        this.panel = null
        this.rows = []
        this.buttons = []
        this.rendered = false
        this._contentY = this.y
    }
    /**
     * @param {Record<string, string>} map
     * @returns {this}
     */
    setLabels(map) {
        for (const k of Object.keys(map))
            this.labels[k] = map[k]
        if (this.rendered) this._syncTexts()
        return this
    }
    /**
     * 批量设置勾选填充色
     * @param {Record<string, number>} map key → 0xRRGGBB
     * @returns {this}
     */
    setColors(map) {
        for (const k of Object.keys(map)) this.colors[k] = map[k]
        if (this.rendered) this._syncCheck()
        return this
    }
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
    toggleAll(v) {
        for (const k of this.keys) {
            this.selected[k] = v ?? !this.selected[k]
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
            { action: 'clear', label: '取消' },
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

            // 勾选填充：颜色取对应矿脉配色，无则回退 checkColor
            const fillColor = this.colors[key] ?? this.checkColor
            const check = overlay.rectBuilder()
                .color(fillColor).alpha(this.selected[key] ? 255 : 0)
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
                if (b.action === 'all') this.toggleAll(true)
                else if (b.action === 'invert') this.toggleAll()
                else if (b.action === 'clear') this.toggleAll(false)
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
    /** 同步复选框显示（含填充色） */
    _syncCheck() {
        for (let i = 0; i < this.keys.length; i++) {
            const key = this.keys[i]
            const check = this.rows[i].check
            check.setColor(this.colors[key] ?? this.checkColor)
            check.setAlpha(this.selected[key] ? 255 : 0)
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

/** 矿脉标记 */
class IeMineral {
    /**
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
     */

    /** @type {JavaClass<ExcavatorHandler>} */
    static ExcavatorHandler = Java.type('blusunrize.immersiveengineering.api.excavator.ExcavatorHandler')
    /** @type {JavaClass<MineralMix>} */
    static MineralMix = Java.type('blusunrize.immersiveengineering.api.excavator.MineralMix')

    /** @type {Object<string, MineralInfo & {texture:{icon:string,color:number,circle:CustomImage}, visiable:boolean}>} */
    static MINERAL_MAP = {}
    /** @type {number} 单矿脉最大储量 */
    static MAX = this.ExcavatorHandler.mineralVeinYield

    /** HSV→RGB 单行版：h 色相(0-360)，s 饱和度(0-1)，v 明度(0-1)，返回 0xRRGGBB */
    static randomColor(h, s, v) {
        const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c
        const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
            : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
        return (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255)
    }

    /** 获取矿脉数据 @returns {List<RecipeHolder<R>>} */
    static recipes() { return this.MineralMix?.RECIPES?.getRecipes(clientLevel()) }
    /**
     * 把配方列表转成 {plainName: {...}} 映射
     * @param {List<RecipeHolder<R>>} recipes
     * @returns {Record<string, MineralInfo>}
     */
    static recipeMap(recipes) {
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

    /** 初始化矿物配方与纹理 */
    static init() {
        Object.entries(this.recipeMap(this.recipes())).forEach(([key, info], i) => {
            let texture = this.MINERAL_MAP[key]?.texture
            if (!texture) {
                let color = this.randomColor((i * 137.508) % 360, 0.75, 0.95)
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
            this.MINERAL_MAP[key] = { ...info, texture, visiable: false }
        })
    }

    /**
     * 读取当前世界所有矿脉
     * @returns {Object<string, VeinEntry[]>} 按维度分组的矿脉
     */
    static loadVeins() {
        const level = clientLevel()
        const veinList = IeMineral.ExcavatorHandler.getMineralVeinList()
        const veins = {}

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
                    x: new DeobfRef(pos).call(['x', 'comp_638', 'f_140723_']),
                    z: new DeobfRef(pos).call(['z', 'comp_639', 'f_140724_']),
                    radius: v.getRadius(),
                    mineral: mineral.getPlainName(),
                    depletion: v.getDepletion()
                })
            }
            veins[dim] = arr
        }
        return veins
    }

    /**
     * 生成提示框文本
     * @param {VeinEntry} entry
     * @returns {string[]}
     */
    static detailsOf(entry) {
        let mineral = this.MINERAL_MAP[entry.mineral]
        if (!mineral) return [`未知矿脉: ${entry.mineral}`]
        let register = Client.getRegistryManager()
        let handle = v => `${register.getItem(v.stack).getName()}(${Math.round(v.chance * 100)}%)`
        return [
            `矿脉: ${mineral.transName}`,
            `中心: ${entry.x}, ${entry.z}`,
            `半径: ${entry.radius}`,
            `储量: ${this.MAX - entry.depletion} (${Math.round((1 - entry.depletion / this.MAX) * 100)}%)`,
            `矿物: ${mineral.outputs.map(handle)}`,
            `废渣: ${mineral.spoils.map(handle)}`,
        ]
    }
}

/** @type {EventBus} 事件总线 */
const bus = new EventBus()
/** @type {XaeroOverlayManager|null} 渲染层管理器 */
let overlay = null
/** @type {Draw2DUtils|null} 过滤面板的裁剪画布 */
let filter_d2d = null
/** @type {MultiSelect|null} 过滤面板 */
let filter_panel = null
/** @type {string|null} 过滤面板监听 id */
let filter_listener = null

/** @type {Draw2D|null} 矿脉渲染共用的 Draw2D */
let d2dBuilder = Hud.createDraw2D()
/** 每个矿物 key → 已注册的元素句柄数组（const，内容可变） */
const veinHandles = {}
/** 每个矿物 key → 该矿物所有矿脉条目（const，内容可变） */
const veinEntries = {}

/** @type {string|null} OpenScreen 监听 id */
let screen_listener = null
/** @type {IScreen|null} 当前打开的世界地图屏幕 */
let currentMapScreen = null

/**
 * 为单个矿脉条目生成 render 回调
 * @param {VeinEntry} entry
 * @returns {Function}
 */
function makeVeinRender(entry) {
    const info = IeMineral.MINERAL_MAP[entry.mineral] ?? IeMineral.MINERAL_MAP.none
    const texture = info.texture
    const render = DeobfRef.methodName(IMPORT.Renderable, 'render', 'method_25394', 'm_88315_')
    const PoseStack = DeobfRef.className(
        'com.mojang.blaze3d.vertex.PoseStack', 'net.minecraft.class_4587',
        'net.minecraft.client.util.math.MatrixStack', 'net.minecraft.src.C_3181_')
    const PoseStack_Pose = DeobfRef.className(
        'com.mojang.blaze3d.vertex.PoseStack$Pose', 'net.minecraft.class_4587$class_4665',
        'net.minecraft.client.util.math.MatrixStack$Entry', 'net.minecraft.src.C_3181_$C_3183_')
    const pose = DeobfRef.methodName(IMPORT.GuiGraphics, 'pose', 'method_51448', 'getMatrices', 'm_280168_')
    const push = DeobfRef.methodName(PoseStack, 'pushPose', 'method_22903', 'push', 'm_85836_')
    const pop = DeobfRef.methodName(PoseStack, 'popPose', 'method_22909', 'pop', 'm_85849_')
    const peek = DeobfRef.methodName(PoseStack, 'last', 'method_23760', 'peek', 'm_85850_')
    const getPositionMatrix = DeobfRef.methodName(PoseStack_Pose, 'pose', 'method_23761', 'getPositionMatrix', 'm_252922_')
    const manager = XaeroOverlayManager

    return JavaWrapper.methodToJava((args) => {
        try {
            const [graphics, e, rinfo, localX, localY, scale, isWorldMap, hovered] = args
            if (isWorldMap && scale < 1) return true

            const r = e.radius * scale
            const iconSize = Math.max(24, scale)
            if (isWorldMap) {
                // 矿脉半径
                const circle = d2dBuilder.imageBuilder()
                    .fromCustomImage(texture.circle)
                    .alpha(isWorldMap ? 150 : 180)
                    .pos((localX - r) | 0, (localY - r) | 0)
                    .size((r * 2) | 0, (r * 2) | 0)
                    .build()
                circle[render](graphics, 0, 0, 0)
            } else {
                const rect = d2dBuilder.rectBuilder()
                    .alpha(isWorldMap ? 150 : 180).color(0)
                    .pos1((localX - iconSize / 2 - 2) | 0, (localY - iconSize / 2 - 2) | 0)
                    .size((iconSize + 4) | 0, (iconSize + 4) | 0)
                    .build()
                rect[render](graphics, 0, 0, 0)
            }
            // 矿脉中心
            const icon = d2dBuilder.itemBuilder()
                .item(Client.getRegistryManager().getItemStack(texture.icon))
                .pos((localX - iconSize / 2) | 0, (localY - iconSize / 2) | 0)
                .scale(iconSize / 16)
                .build()
            icon[render](graphics, 0, 0, 0)
            // 悬停检测
            if (isWorldMap) {
                let tooltips = []
                if (manager.isHovered(e.x, e.z, 3, scale)) {
                    tooltips = IeMineral.detailsOf(entry)
                }
                if (tooltips.length > 0) {
                    let components = manager.toToolTipComponents(tooltips)
                    let stack = graphics[pose]()
                    stack[push]()
                    stack[peek]()[getPositionMatrix]().identity()
                    manager.renderToolTip(graphics, Hud.getMouseX() | 0, Hud.getMouseY() | 0, components)
                    stack[pop]()
                }
            }
        } catch (err) {
            FS.open('log.txt').append(`${err}\n`)
        }
        return true
    })
}

/**
 * 注册单个矿脉元素
 * @param {VeinEntry} entry
 * @returns {object[]} 元素句柄
 */
function addVeinElement(entry) {
    const info = IeMineral.MINERAL_MAP[entry.mineral] ?? IeMineral.MINERAL_MAP.none
    const cx = entry.x | 0
    const cz = entry.z | 0
    const handles = overlay.addElement(
        cx, cz, info.texture.color, entry.radius * 2, makeVeinRender(entry),
        {
            radius: entry.radius,
            depletion: entry.depletion,
            mineral: entry.mineral,
            icon: info.texture.icon
        }
    )
    return handles
}

/**
 * 按矿物 key 重新同步元素（过滤面板变化时调用）
 * @param {string} key 矿物 key
 */
function syncVeinVisibility(key) {
    const visible = IeMineral.MINERAL_MAP[key]?.visiable
    if (veinHandles[key]) {
        for (const h of veinHandles[key])
            overlay.removeElement(h)
        veinHandles[key] = []
    }
    if (visible)
        veinHandles[key] = veinEntries[key].map(v => addVeinElement(v))
}


/**重载当前维度矿脉数据，重建分组与渲染元素 */
function reloadVeinData() {
    for (const k of Object.keys(veinEntries)) delete veinEntries[k]
    for (const k of Object.keys(veinHandles)) delete veinHandles[k]
    const veins = IeMineral.loadVeins()
    const dim = World.getDimension()
    const veinList = veins[dim] || []
    // 按矿物分组
    for (const v of veinList) {
        if (!veinEntries[v.mineral])
            veinEntries[v.mineral] = []
        veinEntries[v.mineral].push(v)
    }
    // 恢复可见性状态，重建渲染句柄
    overlay.clearElements()
    for (const k of Object.keys(veinEntries))
        veinHandles[k] = IeMineral.MINERAL_MAP[k]?.visiable ? veinEntries[k].map(v => addVeinElement(v)) : []
    mclog(`已加载 ${veinList.length} 个矿脉（${Object.keys(veinEntries).length} 种矿物）`)
}

/**
 * 在世界地图屏幕上创建过滤面板
 * @param {IScreen} screen 世界地图屏幕（xaero.map.gui.GuiMap）
 */
function createFilterPanel(screen) {
    let panelX = 25
    let panelY = 10
    let screenH = screen.getHeight()
    let panelW = 200
    let panelH = Math.min(300, screenH - 20)

    filter_d2d = new Draw2DUtils({ x: panelX, y: panelY, width: panelW, height: panelH })
    screen.addDraw2D(filter_d2d.target, panelX, panelY, panelW, panelH)

    let selecteds = {}
    let labels = {}
    let colors = {}
    for (let k of Object.keys(veinEntries)) {
        selecteds[k] = IeMineral.MINERAL_MAP[k].visiable
        labels[k] = `${(IeMineral.MINERAL_MAP[k].transName ?? k).replace(/^.+\./, '')} (${veinEntries[k].length})`
        colors[k] = IeMineral.MINERAL_MAP[k]?.texture?.color ?? 0xFFFFFF
    }

    filter_panel = new MultiSelect({
        selected: selecteds,
        colors: colors,
        x: 4, y: 4, rowHeight: 12, boxSize: 8,
        gap: 4, scale: 0.8,
        color: 0xFFFFFF, boxColor: 0xAAAAAA, checkColor: 0x55FF55, panelAlpha: 200,
        screenOffsetX: panelX,
        screenOffsetY: panelY,
        onChange: (key, selected) => {
            IeMineral.MINERAL_MAP[key].visiable = selected
            syncVeinVisibility(key)
        }
    })
    filter_panel.setLabels(labels)
    filter_panel.render(filter_d2d.target)
}

/** 销毁过滤面板 */
function destroyFilterPanel() {
    if (filter_panel) { filter_panel.remove(); filter_panel = null }
    if (filter_d2d) { filter_d2d.removeTooltip(); filter_d2d.target.unregister(); filter_d2d = null }
}

/** 主入口 */
function main() {
    // 注册 Xaero 渲染层
    overlay = new XaeroOverlayManager().register()
    reloadVeinData()
    // 监听屏幕打开：只在 GuiMap 上挂过滤面板
    screen_listener = JsMacros.on('OpenScreen', JavaWrapper.methodToJava(() => {
        const screen = Hud.getOpenScreen()
        destroyFilterPanel()
        currentMapScreen = null
        Client.runOnMainThread(JavaWrapper.methodToJava(() => { screen.getWidth() }), true, 1000)

        if (screen && Reflection.getClassName(screen) == 'xaero.map.gui.GuiMap') {
            currentMapScreen = screen
            createFilterPanel(screen)
        }
    }))

    // 每 tick：更新 tooltip / 处理面板点击（仅面板存在时）
    filter_listener = bus.addListener(event => {
        if (event.consumed) return
        if (!filter_panel || !filter_d2d) return
        filter_panel.tick(event)
        filter_d2d.tooltips = []
    })
}

/** 清理 */
function teardown() {
    bus.stop()
    if (screen_listener) { JsMacros.off(screen_listener); screen_listener = null }
    destroyFilterPanel()
    if (overlay) {
        overlay.clearElements()
        overlay.unregister()
        overlay = null
    }
    for (const k of Object.keys(veinHandles)) delete veinHandles[k]
    for (const k of Object.keys(veinEntries)) delete veinEntries[k]
    currentMapScreen = null
}

try {
    JsMacros.assertEvent(event, 'Service')
    event.stopListener = JavaWrapper.methodToJava(() => { _listener.off(); toggleEnabled(false); })
    toggleEnabled(true)
} catch { toggleEnabled() }

if (isEnabled()) {
    bus.start()
    IeMineral.init()
    main()
    const step = -1
    let counter = 0
    let latest_dim = World.getDimension()
    _listener.on(() => {
        let cur_dim = World.getDimension()
        if ((step > 0 && ++counter >= step) || latest_dim != cur_dim) {
            counter = 0
            reloadVeinData()
        }
        latest_dim = cur_dim
    }).offHandle = () => teardown()
}
