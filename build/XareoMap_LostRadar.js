// 脚本名称: 失落城市雷达数据
// 功能介绍: 在Xaero世界地图上显示失落城市雷达数据
// 依赖模组: jsmacros、Xaero地图(Xaero's World Map、MiniMap)、失落城市雷达(LostRadar)、ALI高级战利品信息（可选）
// 按键绑定：地图界面（H键 显示/隐藏标记、Shift+左键 添加/取消标记、Alt+左键 跳转到ALI高级战利品信息）
// 更新内容: v1.0 初始化脚本
// 更新内容: v1.1 自动记录停留过的建筑区块，允许添加为常驻服务脚本，修复未正确获取维度名
// 更新内容: v1.2 根据成就完成记录显示建筑是否已收集
// 更新内容: v1.3 H键切换标记显示，高亮显示出建筑标记状态，按存档名隔离存储数据
// 更新内容: v1.4 大型建筑按 buildings 数量扩展相邻同名区块，手动标注和自动记录统一处理
// 更新内容: v1.5 大型建筑和普通建筑用不同纹理高亮
// 更新内容: v1.6 改用地图渲染管线，替代 Draw2D 手动绘制，兼容旧存储数据，统一存储到存档(单人)或者脚本目录(多人)
// 更新内容: v1.7 修复公测版小地图锁定北方获取问题，添加高级战利品显示问题
// 更新内容: v1.8 添加悬浮窗区域显示，纹理添加建筑级别

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
const _dev = true

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
    static type(...class_names) {
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
    static class(...class_names) {
        let type = this.type(...class_names)
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
    get class() { try { return Reflection.getClass(this.classname) } catch { return null } }
    /** @returns {string[]} 所有字段名（缓存） */
    get fields() { return this._fields ??= this.class?.getDeclaredFields().map(v => v.getName()) ?? [] }
    /** @returns {string[]} 所有方法名（缓存） */
    get methods() { return this._methods ??= this.class?.getDeclaredMethods().map(v => v.getName()) ?? [] }
    /** @returns {JavaClass<any>} 父类 */
    get parent() { return this.class?.getSuperclass() }

    /**
     * 获取第一个存在的字段名
     * @param {string[]} names 候选字段名（按优先级）
     * @returns {string?}
     */
    fieldName(...names) {
        for (let name of names)
            if (this.fields.includes(name)) return name
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
            catch { return this.target[name] = value, this.target[name] }
        return null
    }
    /**
     * 获取第一个存在的方法名
     * @param {string[]} method_names 候选方法名（按优先级）
     * @returns {string?}
     */
    methodName(...method_names) {
        for (let name of method_names)
            if (this.methods.includes(name))
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

/** @type {GetJava.Type$Graal<ChunkPos>} */
const ChunkPos = DeobfRef.type('net.minecraft.world.level.ChunkPos',
    'net.minecraft.class_1923', 'net.minecraft.util.math.ChunkPos', 'net.minecraft.src.C_1560_')
/** @type {GetJava.Type$Graal<ResourceLocation>} */
const ResourceLocation = DeobfRef.type('net.minecraft.resources.ResourceLocation',
    'net.minecraft.class_2960', 'net.minecraft.util.Identifier', 'net.minecraft.src.C_5265_')
/** @type {GetJava.Type$Graal<ItemStackHelper>} */
const ItemStackHelper = DeobfRef.type('xyz.wagyourtail.jsmacros.client.api.helpers.inventory.ItemStackHelper')
/** @type {GetJava.Type$Graal<mcjty.lostradar.data.ClientMapData>} @link {https://github.com/McJtyMods/LostRadar} */
const ClientMapData = DeobfRef.type('mcjty.lostradar.data.ClientMapData')?.getData()
/** 长类名集中管理 */
const ModImport = {
    // === Java 标准 ===
    Object: 'java.lang.Object', Double: 'java.lang.Double', Boolean: 'java.lang.Boolean', Float: 'java.lang.Float',
    String: 'java.lang.String', ArrayList: 'java.util.ArrayList', Collections: 'java.util.Collections',
    Iterator: 'java.util.Iterator', Function: 'java.util.function.Function', Throwable: 'java.lang.Throwable',
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
    static suffix = _dev ? `_${Date.now()}` : ''
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
    /** 
     * @typedef {Object} XaeroElement
     * @prop {int} x @prop {int} z @prop {int} color @prop {int} size @prop {boolean} large 
     * @prop {double} scale  @prop {boolean} enabled @prop {Function} render
     * @prop {()=>double} centerX @prop {()=>double} centerZ @prop {()=>string} displayName
     */
    /**  @returns {JavaClass<XaeroElement>} */
    static createElementClass() {

        const name = this.Element
        const { String, Function } = ModImport
        return this.load(name) ?? this.builder({
            name: name, fields: [
                `public int x;`, `public int z;`, `public int color = 0;`,
                `public int size = 16;`, `public boolean large = false;`,
                `public ${Function} render = null;`,
            ], constructors: [`public ${name}(int x, int z, int color, int size, boolean large, ${Function} render) {
                this.x = x; this.z = z; this.color = color; this.size = size; this.large = large; this.render = render;
            }`], methods: [
                `public double centerX() { return (this.x + 0.5) * 16.0; }`,
                `public double centerZ() { return (this.z + 0.5) * 16.0; }`,
                `public ${String} displayName() { return x + "," + z; }`,
            ]
        })
    }
    /**
     * @typedef {Object} XaeroContext
     * @prop {Packages.java.util.ArrayList<XaeroElement>} elements
     * @prop {double} scale @prop {boolean} enabled
     */
    /**  @returns {JavaClass<XaeroContext>} */
    static createContextClass() {
        const name = this.Context
        const { ArrayList } = ModImport
        return this.load(name) ?? this.builder({
            name: name, fields: [
                `public ${ArrayList} elements = new ${ArrayList}();`,
                `public double scale = 1.0;`, `public boolean enabled = true;`,
            ],
        })
    }
    static createProviderClass(name, extend, location) {
        const { Object, Iterator, Collections, ArrayList, Minecraft } = ModImport
        let element = this.className(this.Element)
        let context = this.className(this.Context)
        const mcGet = DeobfRef.methodName(Minecraft, 'getInstance', 'method_1551', 'm_91087_')
        const mcPlayerField = DeobfRef.fieldName(Minecraft, 'player', 'field_1724', 'f_91074_')
        const entityCls = DeobfRef.className('net.minecraft.world.entity.Entity',
            'net.minecraft.class_1297', 'net.minecraft.entity.Entity', 'net.minecraft.src.C_507_')
        const pGetX = DeobfRef.methodName(entityCls, 'getX', 'method_23317', 'm_20185_')
        const pGetZ = DeobfRef.methodName(entityCls, 'getZ', 'method_23321', 'm_20189_')
        const MINI_MAX_DIST = 180
        return this.load(name) ?? this.builder({
            name: name, extend: extend, fields: [`public ${Iterator} iterator = ${Collections}.emptyIterator();`],
            methods: [
                `public void begin(${location} loc, ${Object} ctx) {
                    ${context} context = (${context}) ctx;
                    if (loc != ${location}.OVER_MINIMAP)
                        return this.iterator = new ${ArrayList}(((${context}) ctx).elements).iterator();
                    ${ArrayList} filtered = new ${ArrayList}();
                    ${Minecraft} mc = ${Minecraft}.${mcGet}();
                    if (mc != null && mc.${mcPlayerField} != null) {
                        double px = mc.${mcPlayerField}.${pGetX}(); double pz = mc.${mcPlayerField}.${pGetZ}();
                        double maxDistSq = java.lang.Math.pow(${MINI_MAX_DIST} / context.scale, 2.0);
                        ${ArrayList} elements = context.elements;
                        for (int i = 0; i < elements.size(); i++) {
                            ${element} el = (${element}) elements.get(i);
                            if (el == null) continue;
                            double dx = el.centerX() - px; double dz = el.centerZ() - pz;
                            if (dx * dx + dz * dz <= maxDistSq) filtered.add(el);
                        }
                    }
                    this.iterator = filtered.iterator();
                }`,
                `public boolean hasNext(${location} loc, ${Object} ctx) { return this.iterator.hasNext(); }`,
                `public ${Object} getNext(${location} loc, ${Object} ctx) {
                    return this.iterator.hasNext() ? this.iterator.next() : null;}`,
                `public void end(${location} loc, ${Object} ctx) { this.iterator = ${Collections}.emptyIterator(); }`,
            ]
        })
    }
    static createReaderClass(name, extend, location) {
        const { Object, String, Minecraft } = ModImport
        let elm = this.className(this.Element)
        let ctx = this.className(this.Context)
        return this.load(name) ?? this.builder({
            name: name, extend: extend, methods: [
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
        return this.createProviderClass(this.MINIMAP.Provider, ModImport.MiniProvider, ModImport.MiniLocation)
    }
    static createMinimapReaderClass() {
        return this.createReaderClass(this.MINIMAP.Reader, ModImport.MiniReader, ModImport.MiniLocation)
    }
    static createMinimapRendererClass() {
        const name = this.MINIMAP.Renderer
        const {
            MiniRenderer, MiniLocation, MiniInfo, BufferSource, MiniTextureProvider,
            Object, GuiGraphics, Double, Boolean, Throwable
        } = ModImport
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
                            graphics, el, info, ${Double}.valueOf(localX), ${Double}.valueOf(localY),
                            ${Double}.valueOf(scale), ${Boolean}.FALSE, ${Boolean}.valueOf(hovered)
                        };
                        ${Object} result = e.render.apply(args);
                        return (result instanceof ${Boolean}) && ((${Boolean}) result).booleanValue();
                    } catch (${Throwable} t) { return false; }
                }`,
            ]
        })
    }
    static createWorldMapProviderClass() {
        return this.createProviderClass(this.WORLDMAP.Provider, ModImport.WorldProvider, ModImport.WorldLocation)
    }
    static createWorldMapReaderClass() {
        return this.createReaderClass(this.WORLDMAP.Reader, ModImport.WorldReader, ModImport.WorldLocation)
    }
    static createWorldMapRendererClass() {
        const name = this.WORLDMAP.Renderer
        const {
            WorldRenderer, WorldLocation, WorldInfo, BufferSource, WorldTextureProvider,
            Object, GuiGraphics, Double, Float, Boolean, Throwable
        } = ModImport
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
                            graphics, el, info, ${Double}.valueOf(partialX), ${Double}.valueOf(partialY),
                            ${Double}.valueOf(scale), ${Boolean}.TRUE, ${Boolean}.valueOf(hovered)
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
    /** @typedef {net.minecraft.network.chat.Component} Component */
    constructor() {
        /** @type {JavaClass<XaeroElement>?} 共用类 */
        this.ElementCls = null
        /** @type {JavaClass<XaeroElement>?} 共用类 */
        this.ContextCls = null

        /** @type {boolean} 小地图是否已注册 */
        this.minimapInited = false
        /** @type {xaero.hud.minimap.element.render.over.MinimapElementOverMapRendererHandler?} 小地图Handler实例 */
        this.minimapHandler = null
        /** @type {XaeroContext?} 小地图 Context 实例 */
        this.minimapContext = null
        /** @type {object?} 小地图 Renderer 实例 */
        this.minimapRenderer = null

        /** @type {boolean} 世界地图是否已注册 */
        this.worldMapInited = false
        /** @type {xaero.map.element.MapElementRenderHandler?} 世界地图Handler 实例 */
        this.worldMapHandler = null
        /** @type {XaeroContext?} 世界地图 Context 实例 */
        this.worldMapContext = null
        /** @type {object?} 世界地图 Renderer 实例 */
        this.worldMapRenderer = null
    }

    /** 注册小地图渲染层 */
    registerMinimap() {
        if (this.minimapInited) return this
        this.minimapHandler = Java.type(ModImport.Minimap).instance.getMinimap().getOverMapRendererHandler()
        ModBuilder.createMinimapProviderClass()
        ModBuilder.createMinimapReaderClass()
        const rendererCls = ModBuilder.createMinimapRendererClass()
        this.minimapContext = Reflection.newInstance(this.ContextCls)
        this.minimapRenderer = Reflection.newInstance(rendererCls, this.minimapContext)
        this.minimapHandler.add(this.minimapRenderer)
        this.minimapInited = true
        return this
    }
    /** 注册世界地图渲染层 */
    registerWorldMap() {
        if (this.worldMapInited) return this
        this.worldMapHandler = Java.type(ModImport.WorldMap).mapElementRenderHandler
        ModBuilder.createWorldMapProviderClass()
        ModBuilder.createWorldMapReaderClass()
        const rendererCls = ModBuilder.createWorldMapRendererClass()
        this.worldMapContext = Reflection.newInstance(this.ContextCls)
        this.worldMapRenderer = Reflection.newInstance(rendererCls, this.worldMapContext)
        this.worldMapHandler.add(this.worldMapRenderer)
        this.worldMapInited = true
        return this
    }
    /** 注册所有渲染层 */
    register() {
        this.ElementCls = ModBuilder.createElementClass()
        this.ContextCls = ModBuilder.createContextClass()
        this.registerMinimap()
        this.registerWorldMap()
        mclog('地图渲染层已注册')
        return this
    }
    /** 从渲染管线移除 */
    unregister() {
        if (this.minimapInited) {
            const f = Reflection.getDeclaredField(Reflection.getClass(ModImport.MiniRendererHandler), 'renderers')
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
    add(cx, cz, color = 0x80FF0000, size = 16, large = false, render = null) {
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
    remove(handle) {
        if (!handle) return false
        let removed = false
        if (this.minimapInited) removed = this.minimapContext.elements.remove(handle) || removed
        if (this.worldMapInited) removed = this.worldMapContext.elements.remove(handle) || removed
        return removed
    }
    /** 清空所有元素 */
    clear() {
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
    /** @constant @type {Key} 左 Alt */
    static ALT = 'key.keyboard.left.alt'
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
/** Draw2D拓展：支持裁剪画布+渲染提示框
 * @typedef {{x:int,y:int,width:int,height:int}} Region 显示区域
 * @typedef {net.minecraft.client.gui.DrawContext} DrawContext
 */
class Draw2DUtils {
    /** @type {net.minecraft.client.gui.Font} */
    static Font = new DeobfRef(Client.getMinecraft())
        .get('font', 'field_1772', 'textRenderer', 'f_91114_', 'f_91062_')
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
     * @param {Region} region 显示区域
     * @param {(drawContext:DrawContext) => void} [onrender] 每帧渲染回调
     * @returns {Draw2D} 裁剪后的 Draw2D
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
     * @param {DrawContext} graphics 画板
     * @param {JavaArray<Component>} components 格式化文本列表
     * @param {int} x 坐标
     * @param {int} y 坐标
     * @param {number} scale
     */
    static renderToolTip(graphics, components, x, y, scale) {
        if (graphics) {
            let ox = Math.round(x ?? Hud.getMouseX()), oy = Math.round(y ?? Hud.getMouseY()), oscale = scale ?? 1
            let method = [
                'setComponentTooltipForNextFrame', 'renderComponentTooltip',
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
        /** @type {{x:number,y:number,scale:number,tips:string[]}[]} 提示框内容 */
        this.tooltips = []
        /** @type {null|((self:Draw2DUtils) => {x:number,y:number,scale:number,tips:string[]}[])} */
        this.dynamicTooltips = null

    }
    /** 气泡提示框内容组件
     * @param {string[]} tooltips
     * @returns {JavaArray<Component>}
     */
    asComponents(tooltips) {
        let arr = JavaUtils.createArrayList()
        for (let v of tooltips)
            arr.add(Chat.createTextHelperFromString(v).getRaw())
        return arr
    }
    /** @param {DrawContext} drawContext */
    render(drawContext) {
        this.onrender && this.onrender(this, drawContext)
        if (this.dynamicTooltips)
            this.tooltips = this.dynamicTooltips(this)
        if (this.tooltips.length > 0) {
            for (let i of this.tooltips) {
                if (i.tips.length == 0) continue
                let x = i.x ?? Hud.getMouseX(), y = i.y ?? Hud.getMouseY()
                let components = this.asComponents(i.tips)
                let scale = i.scale ?? 1
                Draw2DUtils.renderToolTip(drawContext, components, x / scale, y / scale, scale)
            }
        }
    }
    /** @param {string[]|(self:Draw2DUtils) => string[]} v */
    setTooltip(v) { typeof v == 'function' ? this.dynamicTooltips = v : this.tooltips = v }
    /** 清除提示框 */
    removeTooltip() { this.tooltips = []; this.dynamicTooltips = null }
}

const utils = {
    /** @returns {ClientLevel} 主世界 ClientLevel */
    level() { return new DeobfRef(Client.getMinecraft()).get('level', 'field_1687', 'world', 'f_91073_') },
    /** @returns {string?} "cx,cz" 获取玩家当前所在区块 key */
    getChunkKey() { let c = Player.getPlayer()?.getChunk(); return `${c.getChunkX()},${c.getChunkZ()}` },
    /** @returns {string} 国际化翻译 */
    transkey(key) { return Chat.createTextHelperFromTranslationKey(key).getString().trim() },
    /** @return {mcjty.lostradar.data.MapPalette$PaletteEntry} */
    getRadarData(x, z, level) { return ClientMapData.getPaletteEntry(level ?? this.level(), new ChunkPos(x, z)) },
    /** 扩展相邻同名建筑区块
     * @param {number} cx 中心区块 X
     * @param {number} cz 中心区块 Z
     * @param {mcjty.lostradar.data.MapPalette$PaletteEntry} centerEntry 中心区块条目
     * @returns {string[]} 区块 key 列表（含自身）
     */
    expandSameBuilding(cx, cz, centerEntry) {
        const name = centerEntry.name()
        const visited = new Set([`${cx},${cz}`])
        if (!name.startsWith('multi_')) return Array.from(visited)
        const queue = [[cx, cz]], level = utils.level()
        while (queue.length > 0) {
            let [x, z] = queue.shift()
            for (let [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                let nx = x + dx, nz = z + dz, nkey = `${nx},${nz}`
                if (visited.has(nkey)) continue
                let nEntry = this.getRadarData(nx, nz, level)
                if (!nEntry || nEntry.name() !== name) continue
                visited.add(nkey)
                queue.push([nx, nz])
            }
        }
        return Array.from(visited)
    },
    /**
     * 标记某区块所属建筑簇为已去过
     * @param {number} cx 中心区块 X
     * @param {number} cz 中心区块 Z
     * @param {string} dim 维度
     * @param {boolean} toggle 切换模式（true=已去过则取消，false=只标记）
     * @param {boolean} [actionBar=false] 是否用动作栏输出（自动记录用）
     * @returns {boolean} 是否实际发生了变更
     */
    markChunkAt(cx, cz, dim, toggle, actionBar = false) {
        let entry = this.getRadarData(cx, cz)
        if (!entry || entry.buildings().size() === 0) return false
        let cluster = this.expandSameBuilding(cx, cz, entry)
        let allVisited = cluster.every(k => visitedStore.getTime(dim, k) != null)
        let targetState = toggle ? !allVisited : true
        let changed = 0
        for (let k of cluster) {
            let has = visitedStore.getTime(dim, k) != null
            if (targetState !== has) { visitedStore.toggle(dim, k); changed++ }
        }
        if (actionBar) {
            if (changed > 0) Chat.actionbar(`添加记录 §a${changed} §7个区块`)
        } else {
            mclog(targetState ? `已标记 §a${cluster.length} §7个区块` : `已取消 §c${cluster.length} §7个区块`)
        }
        return changed > 0
    }
}

/** 进度查询 */
const DCAdvancement = {
    map: {}, manager: Player.getPlayer().getAdvancementManager(),
    loads() {
        for (let v of this.manager.getAdvancementsForIdentifiers().keySet())
            if (v.startsWith('deceasedcraft:')) this.map[v.replace(/\:.*\//, ':')] = v
    },
    isDone(buildid) {
        let id = this.map[`${buildid}`.split('/')[0]]
        return id && this.manager.getAdvancementProgress(id).isDone()
    }
}
/** JEI ALI战利品信息 */
const JEIAPI = {
    path: 'data/ali_chest_loot.json', recipes: [], localRecipes: {}, inited: false,
    init() {
        this.jei = DeobfRef.type('mezz.jei.common.Internal')?.getJeiRuntime()
        this.typeId = new ResourceLocation('ali', 'chest_loot')
        if (!this.jei) return // 未安装JEI
        this.recipeManager = this.jei.getRecipeManager()
        this.recipesGui = this.jei.getRecipesGui()
        this.recipeType = this.recipeManager.getRecipeType(this.typeId).orElse(null)
        if (this.recipeType) {
            this.category = this.recipeManager.getRecipeCategory(this.recipeType)
            this.recipes = Array.from(this.recipeManager.createRecipeLookup(this.recipeType).get().toList())
            // this.recipes = []; this.localRecipes = this.load() // 模拟服务器
            this.save()
        } else {
            this.localRecipes = this.load()
        }
        if (this.recipes.length + Object.keys(this.localRecipes).length == 0) return
        this.inited = true
    },
    show(filter_handle) {
        if (!this.inited || !filter_handle) return
        if (this.recipes.length > 0) {
            let results = this.recipes.filter(v => filter_handle(`${v.type().id()}`))
            if (results.length == 0) return
            Client.runOnMainThread(JavaWrapper.methodToJava(() => {
                this.recipesGui.showRecipes(this.category, results, JavaUtils.createArrayList())
            }), true, 1000)
            return true
        }
        return false
    },
    collect(node, outarr) {
        if (!node) return
        if (/ItemNode|ItemStackNode/.test(Reflection.getClassName(node))) {
            let bounds = node.getCount().bounds()
            for (let v of node.getItems()) {
                let it = new ItemStackHelper(v)
                let enchants = Array.from(it.getEnchantments())
                outarr.push({
                    id: it.getItemId(),
                    name: it.getName().getString() + (enchants.length == 0 ? '' :
                        `[${enchants.map(v => v.getLevelName(v.getLevel())).join(', ')}]`),
                    chance: node.getChance(),
                    min: bounds.lo(), max: bounds.hi()
                })
            }
        } else if (node.nodes)
            for (const c of node.nodes())
                this.collect(c, outarr)
    },
    simplify(entry) {
        let map = new Map(), items = {}
        for (let pool of entry.nodes ? entry.nodes() : []) {
            if (!/LootPoolNode/.test(Reflection.getClassName(pool))) continue
            let poolMap = new Map(), arr = []
            this.collect(pool, arr)
            for (let it of arr) {
                let c = poolMap.get(it.id)
                if (!c) poolMap.set(it.id, { ...it })
                else {
                    c.min = Math.min(c.min, it.min), c.max = Math.max(c.max, it.max)
                    if (c.chance == null) c.chance = it.chance
                }
            }
            for (let it of poolMap.values()) {
                let c = map.get(it.id)
                if (!c) map.set(it.id, { name: it.name, chances: [it.chance], min: it.min, max: it.max })
                else {
                    c.chances.push(it.chance)
                    c.min = Math.min(c.min, it.min)
                    c.max = Math.max(c.max, it.max)
                    if (!c.name && it.name)
                        c.name = it.name
                }
            }
        }
        for (let [id, it] of map) {
            let u = [...new Set(it.chances.filter(c => c != null))].sort((a, b) => a - b)
            items[id] = {
                name: it.name,
                chance: u.length === 0 ? null : u.length === 1 ? u[0] : u,
                count: it.min === it.max ? it.min : `${it.min}-${it.max}`
            }
        }
        return items
    },
    load() { return FS.exists(this.path) ? JSON.parse(FS.open(this.path).read()) : [] },
    save() {
        if (this.recipes.length == 0 || FS.exists(this.path)) return
        let result = {}
        for (let i = 0; i < this.recipes.length; i++) {
            let r = this.recipes[i].type(), id = `${r.id()}`
            if (!/deceasedcraft:/.test(id)) continue
            let name = utils.transkey(id.replace('deceasedcraft:', 'ali/loot_table/'))
            let outputs = {}
            for (let v of r.outputs()) {
                let it = new ItemStackHelper(v)
                outputs[it.getItemId()] = it.getName().getString()
            }
            let items = this.simplify(r.entry())
            for (let k in items)
                if (!items[k].name)
                    items[k].name = outputs[k] || null
            result[id] = { name, items }
        }
        if (Object.keys(result).length > 0) {
            FS.open(this.path).write(JSON.stringify(result, null, 4))
            mclog(`已保存${Object.keys(result).length}条配方到${this.path}`)
        }
    },
    priorityKeys: ['nameless_trinkets', 'artifacts', 'tacz', 'legendarysurvivaloverhaul', 'secruitycraft'],
    pretty() {
        /** @type {Record<string,Set<string>>} */
        let map = {}
        for (let k of Object.keys(this.localRecipes))
            if (ids.some(x => `${k}`.startsWith(x))) {
                let v = this.localRecipes[k]
                for (let ik of Object.keys(v.items)) {
                    let iv = v.items[ik]
                    let [namespace, path] = ik.split(':')
                    map[namespace] ??= new Set()
                    let chance = [iv.chance].flat(2).map(z => (z * 100).toFixed(2) + '%').join(',')
                    map[namespace].add(`    §8- §f${iv.name}§f: ${iv.count} (${chance})`)
                }
            }
        return Object.entries(map).sort((a, b) => {
            let keyA = a[0], keyB = b[0]
            let isPriorityA = this.priorityKeys.includes(keyA), isPriorityB = this.priorityKeys.includes(keyB)
            if (isPriorityA && !isPriorityB) return -1 // 如果 A 是优先，B 不是，A 排前面（返回 -1）
            if (!isPriorityA && isPriorityB) return 1 // 如果 B 是优先，A 不是，B 排前面（返回 1）
            return keyA.localeCompare(keyB)  // 如果都不是优先，或者都是优先，则按照字母序排
        }).map(([k, v]) => [`§7[§6${k}§7]`, ...Array.from(v).sort()]).flat()
    }
}
const LootrPanel = {
    title: null, list: [], page: 1, step: 28,
    reset() { this.title = null, this.list = [], this.page = 1 },
    total() { return Math.ceil(this.list.length / this.step) },
    prevpage() { this.page = Math.max(1, this.page - 1) },
    nextpage() { this.page = Math.min(this.total(), this.page + 1) },
    current() {
        let total = this.total()
        let res
        if (total > 1) {
            let start = (this.page - 1) * this.step
            res = this.list.slice(start, start + this.step)
            res.push(` §8← §7[A] 第 ${this.page} 页 / 共 ${total} 页 [D] →§8 `)
        } else res = [...this.list]
        res.unshift(this.title)
        return res
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
        for (let p of this.readPaths) {
            if (FS.exists(p)) {
                let raw = FS.open(p).read()
                if (raw && raw.length > 0) {
                    this.cache = JSON.parse(raw)
                    if (p !== this.path && Object.keys(this.cache).length > 0) {
                        mclog(`迁移记录 §a${p} §7→ §a${this.path}`)
                        this.save()
                    }
                    break
                }
            }
        }
        return this.cache
    }
    /** 保存到本地文件 */
    save() {
        if (!this.cache) return
        try {
            let dir = this.path.substring(0, this.path.lastIndexOf('/'))
            if (!FS.exists(dir)) FS.makeDir(dir)
            FS.open(this.path).write(JSON.stringify(this.cache))
        } catch (e) {
            mclog(`§c[雷达] 保存已去过记录失败: ${e} ${this.path}`)
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

/** 标记状态（附带纹理初始化） */
const MarkerState = {
    /** @typedef {{color:number, texture:CustomImage?, largeTexture:CustomImage?}} MarkerStateDef 标记状态定义 */
    UNREGISTERED_UNVISITED: { color: 0xFF4444, texture: null, largeTexture: null },
    UNREGISTERED_VISITED: { color: 0xFF8844, texture: null, largeTexture: null },
    REGISTERED_UNVISITED: { color: 0xFFFF44, texture: null, largeTexture: null },
    REGISTERED_VISITED: { color: 0x44FF44, texture: null, largeTexture: null },
    /** 预创建所有标记纹理（区分大小建筑） */
    init() {
        for (const [name, state] of Object.entries(this)) {
            if (typeof state !== 'object' || !('color' in state)) continue
            // 小建筑
            state.texture = Hud.createTexture(16, 16, `lostradar_marker_${name}`)
                .setGraphicsColor(0x000000).fillRect(0, 0, 16, 16)
                .setGraphicsColor(state.color).drawRoundRect(-1, -1, 17, 17, 8, 8)
                .drawRoundRect(1, 1, 13, 13, 16, 16)
                .update()
            // 大建筑
            state.largeTexture = Hud.createTexture(16, 16, `lostradar_marker_large_${name}`)
                .setGraphicsColor(0x000000).fillRect(0, 0, 15, 15)
                .setGraphicsColor(state.color).drawRoundRect(0, 0, 15, 15, 16, 16)
                .drawRect(0, 0, 15, 15)
                .update()
        }
    },
    /**
     * 读取配置文件
     * @param {string} biomeId 群系
     * @returns {string} 标签
     */
    getBiomelargeImageKey(biomeId) {
        let path = file.getParent().replace(/config\\jsMacros.+/, 'config\\craftpresence.json')
        if (!FS.exists(path)) return null
        let data = JSON.parse(FS.open(path).read())
        let biomeData = data?.biomeSettings?.biomeData
        return biomeData[`${biomeId}`.split(':')[1]]?.data?.largeImageKey
    }
}

/** 雷达标记：管理光标周边区块的注册状态渲染 */
class RadarMarker {
    static ClientUtils = DeobfRef.type('xaero.hud.minimap.config.util.MinimapConfigClientUtils')
    static Settings = DeobfRef.type('xaero.minimap.XaeroMinimap')?.instance?.getSettings()
    static Minimap = Java.type('xaero.hud.minimap.BuiltInHudModules').MINIMAP
    /**
     * @param {XaeroOverlayManager} overlay 渲染层管理器
     * @param {VisitedStore} store 已去过存储
     */
    constructor(overlay, store) {
        /** @type {XaeroOverlayManager} */ this.overlay = overlay
        /** @type {Map<string, object>} */ this.elements = new Map()
        /** @type {VisitedStore} */ this.store = store
        /** @type {string?} */ this.lastSyncKey = null
        /** @type {Draw2D} */ this.d2d = Hud.createDraw2D()
        /** @type {boolean} 渲染开关 */
        this.enabled = GlobalVars.getBoolean(`${scriptName}:Hightlight`)
        /** @type {string} render方法名 */
        this.render = DeobfRef.methodName(ModImport.Renderable, 'render', 'method_25394', 'm_88315_')
    }
    /** 清空所有标记 */
    clear() { this.overlay.clear(); this.elements.clear(); this.lastSyncKey = null }
    /** 切换开关 */
    toggle() {
        this.enabled = !this.enabled
        GlobalVars.putBoolean(`${scriptName}:Hightlight`, this.enabled)
        if (!this.enabled) this.clear()
        return this.enabled
    }
    /**
     * 判断某区块的标记状态
     * @param {mcjty.lostradar.data.MapPalette$PaletteEntry} entry
     * @param {number} cx
     * @param {number} cz
     * @param {string} dim
     * @returns {{state:MarkerStateDef, isLarge:boolean, level:number, temp: number}?}
     */
    stateOf(entry, cx, cz, dim) {
        let buildings = Array.from(entry.buildings())
        if (buildings.length === 0) return null
        let registered = DCAdvancement.isDone(buildings[0])
        let visited = this.store.getTime(dim, `${cx},${cz}`) != null
        // 获取区域级别
        let iconKey = `${entry.iconU()}_${entry.iconV()}`
        let regionInfo = RadarTooltip.ICON_MAP[iconKey]
        let state = registered
            ? visited ? MarkerState.REGISTERED_VISITED : MarkerState.REGISTERED_UNVISITED
            : visited ? MarkerState.UNREGISTERED_VISITED : MarkerState.UNREGISTERED_UNVISITED
        return {
            state, isLarge: entry.name().startsWith('multi_'),
            level: regionInfo ? regionInfo.level : 0,
            temp: regionInfo.temp ?? 0
        }
    }
    /**
     * @param {boolean} isLarge 是否大型建筑
     * @param {MarkerStateDef} state 已算好的状态（由 rebuild 传入）
     * @param {number} temp 寒热
     * @param {number} level 级别
     * @returns {Function}
     */
    makeRender(isLarge, state, level, temp) {
        const self = this
        return JavaWrapper.methodToJava((args) => {
            try {
                const [graphics, e, info, localX, localY, scale, isWorldMap, hovered] = args
                const RomanNumber = ['', 'I', 'II', 'III', 'IV', 'V']
                const tex = isLarge ? state.largeTexture : state.texture
                if (!tex) return false

                let mapSize = RadarMarker.Minimap.getCurrentSession().getProcessor().getMinimapSize()
                let shape = RadarMarker.Settings.minimapShape
                let isLocked = (RadarMarker.ClientUtils?.getEffectiveNorthLocked(mapSize / 2, 0))
                    || (RadarMarker.Settings?.getLockNorth && RadarMarker.Settings.getLockNorth(mapSize / 2, shape))
                let half = (e.size / 2) * scale
                let deg = isWorldMap ? 0 : isLocked ? 0 : -90 - (Player.getPlayer().getYaw() ?? 0)

                let img = self.d2d.imageBuilder()
                    .fromCustomImage(tex).alpha(isWorldMap ? 200 : 180)
                    .pos((localX - half) | 0, (localY - half) | 0)
                    .size(Math.max(2, (half * 2) | 0), Math.max(2, (half * 2) | 0))
                    .rotation(deg).rotateCenter(true)
                    .build()
                img[self.render](graphics, 0, 0, 0)
                if (level > 0) {
                    let textColor = [0x0078d4, 0x00b294, 0xd83b01][temp + 1]
                    let text = self.d2d.textBuilder().text(RomanNumber[level])
                        .color(textColor).scale(scale * (isLarge ? 1 : 0.8))
                        .build().align(img, 'CenterOnCenter', 'CenterOnCenter')
                    text[self.render](graphics, 0, 0, 0)
                }
            } catch (err) { mclog(`[地图渲染管线] ${err}]`, 12) }
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
        DCAdvancement.loads()
        let syncKey = `${dim}|${ccx},${ccz}`
        if (!force && syncKey === this.lastSyncKey) return
        this.lastSyncKey = syncKey

        if (!this.enabled) return this.clear()
        if (force)
            this.overlay.clear(), this.elements.clear()
        /** @type {Map<string, {entry:any, isLarge:boolean, state:any, searched:boolean, level:number}>} */
        let want = new Map()
        let clientLevel = utils.level()
        let RADIUS = radius ?? MARKER_RADIUS
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
            for (let dz = -RADIUS; dz <= RADIUS; dz++) {
                let cx = ccx + dx, cz = ccz + dz, k = `${cx},${cz}`
                let entry = utils.getRadarData(cx, cz, clientLevel)
                if (!entry) continue
                let st = this.stateOf(entry, cx, cz, dim)
                if (!st) continue
                want.set(k, { entry, isLarge: st.isLarge, state: st.state, level: st.level, temp: st.temp })
            }
        }
        // 移除不在 want 的
        for (let [k, h] of Array.from(this.elements)) {
            if (!want.has(k)) {
                this.overlay.remove(h)
                this.elements.delete(k)
            }
        }
        // 添加新增的
        for (let [k, { entry, isLarge, state, level, temp }] of want) {
            if (this.elements.has(k)) continue
            let [cx, cz] = k.split(',').map(Number)
            let size = isLarge ? 16 : 14
            let el = this.overlay.add(cx, cz, state.color, size, isLarge, this.makeRender(isLarge, state, level, temp))
            this.elements.set(k, el)
        }
    }
}

/** tooltip 构建器 */
class RadarTooltip {
    static ICON_MAP = {
        "0_0": { level: 1, temp: 0, id: "suburb_residential", name: '§a郊区住宅群§8 | §a🍃§8 | §a🌡温暖' },
        "32_0": { level: 2, temp: 1, id: "highrise_office", name: '§c摩天办公区§8 | §c🔥🔥§8 | §c🌡炎热' },
        "64_0": { level: 2, temp: -1, id: "highrise_residential", name: '§9摩天住宅区§8 | ❄️❄️§8 | §9🌡寒冷' },
        "96_0": { level: 3, temp: 1, id: "highrise_hotel", name: '§c摩天酒店区§8 | §c🔥🔥🔥§8 | §c🌡炽热难耐' },
        "128_0": { level: 3, temp: -1, id: "retail_district", name: '§9零售商业区§8 | §9❄️❄️❄️§8 | §9🌡严寒刺骨' },
        "-1_-1": { level: 4, temp: 1, id: "wasteland", name: '§c荒地§8 | §c☢️☢️☢️☢️§8 | §c🌡辐射警告' }
    }
    /** @param {VisitedStore} store */
    constructor(store) { /** @type {VisitedStore} */ this.store = store }
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
        let localized = utils.transkey(entry.translatableKey())
        if (localized && localized !== entry.translatableKey()) name = localized
        let region = RadarTooltip.ICON_MAP[`${entry.iconU()}_${entry.iconV()}`]
        let registered = DCAdvancement.isDone(buildings[0])
        let visited = this.store.getTime(dim, `${cx},${cz}`) != null

        lines.push(`§e${name} §7(${entry.name()})`)
        if (region) lines.push(` §8-§7 区域: ${region.name}`)
        lines.push(` §8-§7 收集: ${registered ? '§a已注册' : '§c未注册'}`)
        lines.push(` §8-§7 去过: ${visited ? '§a已去过' : '§c未去过'}`)
        lines.push((visited ? `§8[Shift+左键] 取消标记` : `§8[Shift+左键] 标记去过`)
            + (!JEIAPI.inited ? '' : ` §8[Alt+左键] ${JEIAPI.recipes.length > 0 ? '跳转JEI' : '查看战利品'}`))
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
        return [` §8-§7 去过: §7(${timeStr})`, ` §8-§7 区块: §f${cx}, ${cz}`, `§8[Shift+左键] 取消标记`]
    }
}

function main() {
    overlay = new XaeroOverlayManager().register()
    marker = new RadarMarker(overlay, visitedStore)

    // 从当前玩家位置初始化一次
    let pk = utils.getChunkKey()
    if (pk) {
        let [pcx, pcz] = pk.split(',').map(Number), dim = World.getDimension()
        marker.rebuild(pcx, pcz, dim)
    }

    screen_listener = JsMacros.on('OpenScreen', JavaWrapper.methodToJava(() => {
        const screen = Hud.getOpenScreen()
        bus.remove(filter_listener)
        tipDraw = null
        if (screen && Reflection.getClassName(screen) == 'xaero.map.gui.GuiMap') {
            DCAdvancement.loads()
            let guimap = new WorldMap(screen)
            let tipRegion = {
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
                    let entry = utils.getRadarData(cx, cz)
                    if (entry) {
                        lines = radarTooltip.build(entry, cx, cz, dim)
                    } else {
                        const vt = visitedStore.getTime(dim, `${cx},${cz}`)
                        if (vt != null) lines = radarTooltip.buildVisitedOnly(cx, cz, vt)
                    }
                    self.tooltips = [{ tips: lines }, { x: 20, y: 30, tips: LootrPanel.current() }]
                } catch (err) { mclog(`[Draw2D渲染管线] ${err}`, 12) }
            })
            screen.addDraw2D(tipDraw.target, 0, 0, tipRegion.width, tipRegion.height)
            // ==================== 按键监听 ====================
            /** @type {string?} 上次查询的区块 key */
            let last_key = null
            let tick_counter = 0

            filter_listener = bus.addListener(event => {
                let pressedKeys = event.keys
                if (pressedKeys.length == 0 && ++tick_counter % 3 !== 0) return
                tick_counter = 0
                // 读鼠标区块
                let cx = guimap.mouseBlockPosX >> 4, cz = guimap.mouseBlockPosZ >> 4
                let key = `${cx},${cz}`, dim = World.getDimension()
                // ---- H 键：切换标记渲染 ----
                if (event.click(Event.KEY_H)) { marker.toggle() && marker.rebuild(cx, cz, dim, true) }
                else if (event.click('key.keyboard.a')) { LootrPanel.prevpage() }
                else if (event.click('key.keyboard.d')) { LootrPanel.nextpage() }
                else if (event.click(Event.LEFTCLICK)) {
                    if (pressedKeys.includes(Event.ALT)) {
                        // ---- Alt+左键：切换到战利品页面 ----
                        let entry = utils.getRadarData(cx, cz)
                        if (entry) {
                            let buildings = Array.from(entry.buildings())
                            if (buildings.length > 0) {
                                let ids = buildings.map(x => `${x}`.replace(entry.name(), 'chests') + '/')
                                if (!JEIAPI.show((v) => ids.some(x => `${v}`.startsWith(x)))
                                    && Object.keys(JEIAPI.localRecipes).length > 0) {
                                    LootrPanel.reset()
                                    LootrPanel.title = `§6战利品信息: ${utils.transkey(entry.translatableKey())}`
                                    LootrPanel.list = JEIAPI.pretty()
                                }
                            }
                        }
                    } else if (pressedKeys.includes(Event.SHIFT)) {
                        // ---- Shift+左键：切换已去过状态 ----
                        if (utils.markChunkAt(cx, cz, dim, true))
                            last_key = null, marker.rebuild(cx, cz, dim, true)
                    } else LootrPanel.reset()
                }

                // ---- 鼠标换区块：重建周边 element ----
                if (key !== last_key)
                    last_key = key, marker.rebuild(cx, cz, dim)
            })
        }
    }))
    interact_listener = JsMacros.on("InteractBlock", JavaWrapper.methodToJava((e, ctx) => {
        let id = `${e.block.getId()}`
        let catalog = 'deceasedcraft:building_catalog'
        let mainHand = Player.getPlayer().getMainHand().getItemId()
        let pos = e.block.getBlockPos()
        let cx = pos.getX() >> 4
        let cz = pos.getZ() >> 4
        let dim = World.getDimension()
        if (mainHand == catalog || /lootr_/.test(id)) {
            utils.markChunkAt(cx, cz, dim, false, true)
            let entry = utils.getRadarData(cx, cz)
            if (entry) {
                let buildings = Array.from(entry.buildings())
                if (buildings.length > 0 && !DCAdvancement.isDone(buildings[0]))
                    mclog('此建筑尚未注册')
            }
            marker?.rebuild(cx, cz, dim, true, 5)
        }
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
const radarTooltip = new RadarTooltip(visitedStore)
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
    JEIAPI.init()
    main()
    _listener.step = 5
    _listener.on(() => {
        const playerKey = utils.getChunkKey()
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
