// 脚本名称: Xaero地图自定义渲染层
// 功能介绍: 在Xaero小地图和世界地图上创建自定义渲染层并注册至渲染管线
// 依赖模组: jsmacros、Xaero小地图(Xaero's Minimap)、Xaero世界地图(Xaero's World Map)
// 更新内容: v1.0 初始化脚本
// 更新内容: v1.1 元素自定义render，可以自定义渲染内容
// 更新内容: v1.2 增加世界地图渲染层

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
    List: 'java.util.List',
    ArrayList: 'java.util.ArrayList',
    Collections: 'java.util.Collections',
    Iterator: 'java.util.Iterator',
    Function: 'java.util.function.Function',
    Throwable: 'java.lang.Throwable',
    // === MC 类（探测） ===
    GuiGraphics: DeobfRef.className(
        'net.minecraft.client.gui.GuiGraphics', 'net.minecraft.class_332',
        'net.minecraft.client.gui.DrawContext', 'net.minecraft.src.C_279497_',
    ),
    BufferSource: DeobfRef.className(
        'net.minecraft.client.renderer.MultiBufferSource$BufferSource', 'net.minecraft.class_4597$class_4598',
        'net.minecraft.client.render.VertexConsumerProvider$Immediate', 'net.minecraft.src.C_4139_$C_4140_',
    ),
    Minecraft: DeobfRef.className(
        'net.minecraft.client.Minecraft', 'net.minecraft.class_310',
        'net.minecraft.client.MinecraftClient', 'net.minecraft.src.C_3391_',
    ),
    Renderable: DeobfRef.className(
        'net.minecraft.client.gui.components.Renderable', 'net.minecraft.class_4068',
        'net.minecraft.client.gui.Drawable', 'net.minecraft.src.C_252359_',
    ),
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
                `public ${Function} render = null;`,
            ],
            constructors: [`public ${name}(int x, int z, int color, int size, ${Function} render) {
                this.x = x; this.z = z; this.color = color; this.size = size; this.render = render;
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
        const { Object, Iterator, Collections, ArrayList } = IMPORT
        let element = this.className(this.Element)
        let context = this.className(this.Context)
        return this.load(name) ?? this.builder({
            name: name, extend: extend,
            fields: [`public ${Iterator} iterator = ${Collections}.emptyIterator();`],
            constructors: [`public ${name}() { super(); }`],
            methods: [
                `public void begin(${location} loc, ${Object} ctx) {
                    this.iterator = new ${ArrayList}(((${context}) ctx).elements).iterator();
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
     * @param {Function|null} [render=null] 元素渲染回调
     * @returns {object} 元素实例
     */
    addElement(cx, cz, color = 0x80FF0000, size = 16, render = null) {
        if (!this.minimapInited && !this.worldMapInited) throw new Error('XaeroOverlayManager 未 register')

        const ElementCls = this.ElementCls
        const el = Reflection.newInstance(ElementCls, cx | 0, cz | 0, color | 0, size | 0, render)
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

    /** 小地图元素数量 @returns {number} */
    get minimapSize() { return this.minimapInited ? this.minimapContext.elements.size() : 0 }

    /** 世界地图元素数量 @returns {number} */
    get worldMapSize() { return this.worldMapInited ? this.worldMapContext.elements.size() : 0 }

    setEnabled(v) {
        if (this.minimapInited) this.minimapContext.enabled = !!v
        if (this.worldMapInited) this.worldMapContext.enabled = !!v
    }
    isEnabled() {
        return (this.minimapInited && this.minimapContext.enabled)
            || (this.worldMapInited && this.worldMapContext.enabled)
    }
    toggle() {
        const now = !this.isEnabled()
        this.setEnabled(now)
        return now
    }
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
    static renderToolTip(graphics, x, y, components) {
        if (graphics) {
            let method = [
                'setComponentTooltipForNextFrame', 'renderComponentTooltip',
                'method_51434', 'drawTooltip', 'm_403688_', 'm_280666_'
            ]
            let dcref = new DeobfRef(graphics)
            try {
                dcref.call(method, this.Font, components, Math.round(x), Math.round(y))
                dcref.call(['renderDeferredElements', 'method_73199', 'drawDeferredElements', 'm_280637_'])
            } catch {
                dcref.call(method, this.Font, components, Math.round(x), Math.round(y),
                    Player.getPlayer().getMainHand().getRaw())
            }
        }
    }
}

/** 初始化 */
function setup() {
    const d2d = Hud.createDraw2D()
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
    const angle = () => -90 - Player.getPlayer().getYaw()

    // 矩形：跟随地图
    const rectFollowMap = JavaWrapper.methodToJava((args) => {
        try {
            const [graphics, e, info, localX, localY, scale, isWorldMap, hovered] = args
            const half = (e.size / 2) * scale
            const deg = isWorldMap ? 0 : angle()
            const manager = XaeroOverlayManager

            const rect = d2d.rectBuilder()
                .pos((localX - half) | 0, (localY - half) | 0, (localX + half) | 0, (localY + half) | 0)
                .color(e.color).alpha(100).rotation(deg)
                .build()
            rect.setRotateCenter(true)
            rect[render](graphics, 0, 0, 0)
            if (isWorldMap) {
                let tooltips = []
                if (manager.isHovered(e.centerX(), e.centerZ(), e.size / 4, scale)) {
                    tooltips = [
                        `x: ${e.x} z: ${e.z}`,
                        `scale: ${scale}`,
                        `localX: ${localX}`,
                        `localY: ${localY}`,
                        `isWorldMap: ${isWorldMap}`,
                    ]
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
        } catch (e) { Chat.log(e) }
        return true
    })

    // 矩形：固定 45°
    const rectFixed45 = JavaWrapper.methodToJava((args) => {
        try {
            const [graphics, e, info, localX, localY, scale, isWorldMap, hovered] = args
            const half = (e.size / 2) * scale

            const rect = d2d.rectBuilder()
                .pos((localX - half) | 0, (localY - half) | 0, (localX + half) | 0, (localY + half) | 0)
                .color(e.color).alpha(100).rotation(45)
                .build()
            rect.setRotateCenter(true)
            rect[render](graphics, 0, 0, 0)
        } catch (e) { Chat.log(e) }
        return true
    })

    const tex = Hud.createTexture(16, 16, `custom_image_${Date.now()}`)
        .setGraphicsColor(0x000000)
        .fillRect(1, 1, 14, 14)
        .setGraphicsColor(0xea4300)
        .drawRoundRect(0, 0, 15, 15, 8, 8)
        .drawRoundRect(3, 3, 9, 9, 8, 8)
        .setXorMode(0x000000)
        .drawRect(0, 0, 15, 15)
        .update()
    const imageRender = JavaWrapper.methodToJava((args) => {
        try {
            const [graphics, e, info, localX, localY, scale, isWorldMap, hovered] = args
            const half = (e.size / 2) * scale
            const deg = isWorldMap ? 0 : angle()
            const image = d2d.imageBuilder()
                .fromCustomImage(tex).alpha(isWorldMap ? 150 : 200)
                .pos((localX - half) | 0, (localY - half) | 0)
                .size((half * 2) | 0, (half * 2) | 0).rotation(deg).rotateCenter(true)
                .build()
            image[render](graphics, 0, 0, 0)
        } catch (e) { Chat.log(e) }
        return true
    })

    overlay = new XaeroOverlayManager().register()

    const p = Player.getPlayer()
    if (p) {
        const pcx = Math.floor(p.getPos().x / 16)
        const pcz = Math.floor(p.getPos().z / 16)

        for (let dx = -1; dx <= 1; dx++)
            for (let dz = -1; dz <= 1; dz++)
                overlay.addElement(pcx + dx, pcz + dz, 0x80FF0000, 16, rectFollowMap)

        overlay.addElement(pcx + 20, pcz, 0x8000FF00, 16, rectFixed45)
        overlay.addElement(pcx, pcz, 0x800000FF, 16, imageRender)
    }
}

/** 清理 */
function teardown() {
    if (overlay) {
        overlay.unregister()
        overlay = null
    }
}

/** @type {XaeroOverlayManager|null} */
let overlay = null

try {
    JsMacros.assertEvent(event, 'Service')
    event.stopListener = JavaWrapper.methodToJava(() => { _listener.off(); toggleEnabled(false); })
    toggleEnabled(true)
} catch { toggleEnabled() }

if (isEnabled()) {
    setup()
    _listener.on(() => {}).offHandle = () => teardown()
}
