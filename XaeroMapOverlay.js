// 脚本名称: Xaero地图自定义渲染层
// 功能介绍: 在Xaero小地图和世界地图上创建自定义渲染层并注册至渲染管线
// 依赖模组: jsmacros、Xaero小地图(Xaero's Minimap)、Xaero世界地图(Xaero's World Map)
// 更新内容: v1.0 初始化脚本
// 更新内容: v1.1 元素自定义render，可以自定义渲染内容
// 更新内容: v1.2 增加世界地图渲染层

const scriptName = 'XaeroMapOverlay.ToggleScript'

const mclog = (msg, color = 0x7) => Chat.log(Chat.createTextBuilder()
    .append("[").withColor(0x5).append(scriptName).withColor(0x5)
    .append("]").withColor(0x5).append(" " + msg).withColor(color).build())
const isToggle = () => GlobalVars.getBoolean(scriptName)
const setToggle = (v) => mclog(GlobalVars.putBoolean(scriptName, v) ? "启用" : "关闭")

/** 反混淆 */
class DeobfRef {
    /**
     * 探测类名
     * @param {string[]} names 候选名
     * @returns {string|null} 类名
     */
    static className(...names) {
        for (const n of names)
            try { return Reflection.getClass(n).getName() } catch { }
        return null
    }
    /**
     * 探测方法名
     * @param {string} cls
     * @param {string[]} names 候选名
     * @returns {string|null} 方法名
     */
    static methodName(cls, ...names) {
        const methods = Reflection.getClass(cls).getDeclaredMethods()
        for (let n of names)
            for (let m of methods)
                if (m.getName() === n)
                    return n
        return null
    }
    /**
     * 探测字段名
     * @param {string} cls
     * @param {string[]} names 候选名
     * @returns {string|null} 字段名
     */
    static fieldName(cls, ...names) {
        const fields = Reflection.getClass(cls).getDeclaredFields()
        for (let n of names)
            for (let m of fields)
                if (m.getName() === n)
                    return n
        return null
    }
}

/** 动态类构建工厂（小地图 + 世界地图） */
class ModBuilder {
    static package = 'xyz.wagyourtail.jsmacros.core.library.impl.classes.proxypackage.'
    static suffix = ''

    /** 共用 Element 短名 */
    static ELEMENT = `XaeroOverlay$Element${this.suffix}`
    /** 小地图短名 */
    static MINIMAP = {
        Context: `XaeroMinimapOverlay$Context${this.suffix}`,
        Provider: `XaeroMinimapOverlay$Provider${this.suffix}`,
        Reader: `XaeroMinimapOverlay$Reader${this.suffix}`,
        Renderer: `XaeroMinimapOverlay$Renderer${this.suffix}`,
    }
    /** 世界地图短名 */
    static WORLDMAP = {
        Context: `XaeroWorldMapOverlay$Context${this.suffix}`,
        Provider: `XaeroWorldMapOverlay$Provider${this.suffix}`,
        Reader: `XaeroWorldMapOverlay$Reader${this.suffix}`,
        Renderer: `XaeroWorldMapOverlay$Renderer${this.suffix}`,
    }
    /** 长类名集中管理 */
    static IMPORT = {
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

    static load(name) { try { return Reflection.getClassFromClassBuilderResult(name) } catch { return null } }
    static className(name) { return this.package + name }

    // ==================== 共用 Element ====================
    static createElementClass() {
        const name = this.ELEMENT
        let exist = this.load(name)
        if (exist) return exist

        const I = this.IMPORT
        Reflection.createClassBuilder(name, Java.type(I.Object))
            .addField(`public int chunkX;`)
            .addField(`public int chunkZ;`)
            .addField(`public int color = 0x80FF0000;`)
            .addField(`public int size = 16;`)
            .addField(`public ${I.Function} render = null;`)
            .addConstructor(`public ${name}(int chunkX, int chunkZ, int color, int size, ${I.Function} render) {
                this.chunkX = chunkX; this.chunkZ = chunkZ; this.color = color; this.size = size; this.render = render;
            }`)
            .addMethod(`public double centerX() { return (this.chunkX + 0.5) * 16.0; }`)
            .addMethod(`public double centerZ() { return (this.chunkZ + 0.5) * 16.0; }`)
            .finishBuildAndFreeze()
        return Reflection.getClassFromClassBuilderResult(name)
    }

    // ==================== 小地图 ====================
    static createMinimapContextClass() {
        const name = this.MINIMAP.Context
        let exist = this.load(name)
        if (exist) return exist

        const I = this.IMPORT
        Reflection.createClassBuilder(name, Java.type(I.Object))
            .addField(`private ${I.List} elements = ${I.Collections}.synchronizedList(new ${I.ArrayList}());`)
            .addField(`private ${I.MiniLocation} location = ${I.MiniLocation}.UNKNOWN;`)
            .addField(`private double zoomScale = 1.0;`)
            .addField(`private boolean enabled = true;`)
            .addConstructor(`public ${name}() { super(); }`)
            .addMethod(`private static double readZoomScale(${I.MiniInfo} info) {
                try {
                    xaero.common.HudMod mod = xaero.common.HudMod.INSTANCE;
                    if (mod != null && mod.getMinimap() != null) {
                        ${I.MiniFBO} r = mod.getMinimap().getMinimapFBORenderer();
                        if (r != null) {
                            double z = r.getZoom();
                            if (z > 0.0 && z < 64.0) return z;
                        }
                    }
                } catch (${I.Throwable} ignored) { }
                return (info != null && info.backgroundCoordinateScale > 0.0 && info.backgroundCoordinateScale < 64.0)
                    ? info.backgroundCoordinateScale : 1.0; }`)
            .addMethod(`public void refresh(${I.MiniInfo} info) {
                this.location = (info == null) ? ${I.MiniLocation}.UNKNOWN : info.location;
                this.zoomScale = readZoomScale(info); }`)
            .addMethod(`public ${I.List} elements() { return this.elements; }`)
            .addMethod(`public ${I.MiniLocation} location() { return this.location; }`)
            .addMethod(`public double zoomScale() { return this.zoomScale; }`)
            .addMethod(`public boolean enabled() { return this.enabled; }`)
            .addMethod(`public void setEnabled(boolean v) { this.enabled = v; }`)
            .finishBuildAndFreeze()
        return Reflection.getClassFromClassBuilderResult(name)
    }
    static createMinimapProviderClass() {
        const name = this.MINIMAP.Provider
        let exist = this.load(name)
        if (exist) return exist

        const I = this.IMPORT
        let element = this.className(this.ELEMENT)
        let context = this.className(this.MINIMAP.Context)
        Reflection.createClassBuilder(name, Java.type(I.MiniProvider))
            .addField(`private ${I.Iterator} iterator = ${I.Collections}.emptyIterator();`)
            .addConstructor(`public ${name}() { super(); }`)
            .addMethod(`public void begin(${I.MiniLocation} location, ${I.Object} ctx) {
                ${context} context = (${context}) ctx;
                this.iterator = (location == ${I.MiniLocation}.OVER_MINIMAP)
                    ? new ${I.ArrayList}(context.elements()).iterator()
                    : ${I.Collections}.emptyIterator(); }`)
            .addMethod(`public boolean hasNext(${I.MiniLocation} location, ${I.Object} ctx) {
                return location == ${I.MiniLocation}.OVER_MINIMAP && this.iterator.hasNext(); }`)
            .addMethod(`public ${I.Object} getNext(${I.MiniLocation} location, ${I.Object} ctx) {
                return this.iterator.hasNext() ? (${element}) this.iterator.next() : null; }`)
            .addMethod(`public void end(${I.MiniLocation} location, ${I.Object} ctx) {
                this.iterator = ${I.Collections}.emptyIterator(); }`)
            .finishBuildAndFreeze()
        return Reflection.getClassFromClassBuilderResult(name)
    }
    static createMinimapReaderClass() {
        const name = this.MINIMAP.Reader
        let exist = this.load(name)
        if (exist) return exist

        const I = this.IMPORT
        let element = this.className(this.ELEMENT)
        let context = this.className(this.MINIMAP.Context)
        Reflection.createClassBuilder(name, Java.type(I.MiniReader))
            .addConstructor(`public ${name}() { super(); }`)
            .addMethod(`public boolean isHidden(${I.Object} e, ${I.Object} c) { return e == null; }`)
            .addMethod(`public double getRenderX(${I.Object} e, ${I.Object} c, float p) { return ((${element}) e).centerX(); }`)
            .addMethod(`public double getRenderY(${I.Object} e, ${I.Object} c, float p) { return 0.0; }`)
            .addMethod(`public double getRenderZ(${I.Object} e, ${I.Object} c, float p) { return ((${element}) e).centerZ(); }`)
            .addMethod(`public int getInteractionBoxLeft(${I.Object} e, ${I.Object} c, float p) { return -8; }`)
            .addMethod(`public int getInteractionBoxRight(${I.Object} e, ${I.Object} c, float p) { return 8; }`)
            .addMethod(`public int getInteractionBoxTop(${I.Object} e, ${I.Object} c, float p) { return -8; }`)
            .addMethod(`public int getInteractionBoxBottom(${I.Object} e, ${I.Object} c, float p) { return 8; }`)
            .addMethod(`public int getRenderBoxLeft(${I.Object} e, ${I.Object} c, float p) { return -8; }`)
            .addMethod(`public int getRenderBoxRight(${I.Object} e, ${I.Object} c, float p) { return 8; }`)
            .addMethod(`public int getRenderBoxTop(${I.Object} e, ${I.Object} c, float p) { return -8; }`)
            .addMethod(`public int getRenderBoxBottom(${I.Object} e, ${I.Object} c, float p) { return 8; }`)
            .addMethod(`public int getLeftSideLength(${I.Object} e, ${I.Minecraft} mc) { return 16; }`)
            .addMethod(`public ${I.String} getMenuName(${I.Object} e) { return ""; }`)
            .addMethod(`public ${I.String} getFilterName(${I.Object} e) { return ""; }`)
            .addMethod(`public int getMenuTextFillLeftPadding(${I.Object} e) { return 0; }`)
            .addMethod(`public int getRightClickTitleBackgroundColor(${I.Object} e) { return 0; }`)
            .addMethod(`public boolean shouldScaleBoxWithOptionalScale() { return true; }`)
            .addMethod(`public float getBoxScale(${I.MiniLocation} loc, ${I.Object} e, ${I.Object} c) {
                return (float) Math.max(0.01, Math.min(64.0, ((${context}) c).zoomScale())); }`)
            .finishBuildAndFreeze()
        return Reflection.getClassFromClassBuilderResult(name)
    }
    static createMinimapRendererClass() {
        const name = this.MINIMAP.Renderer
        let exist = this.load(name)
        if (exist) return exist

        const I = this.IMPORT
        let element = this.className(this.ELEMENT)
        let context = this.className(this.MINIMAP.Context)
        let reader = this.className(this.MINIMAP.Reader)
        let provider = this.className(this.MINIMAP.Provider)
        Reflection.createClassBuilder(name, Java.type(I.MiniRenderer))
            .addConstructor(`public ${name}(${context} ctx) { super(new ${reader}(), new ${provider}(), ctx); }`)
            .addMethod(`public boolean shouldRender(${I.MiniLocation} loc) {
                return loc == ${I.MiniLocation}.OVER_MINIMAP && ((${context}) this.context).enabled(); }`)
            .addMethod(`public int getOrder() { return 100; }`)
            .addMethod(`public void preRender(${I.MiniInfo} info, ${I.BufferSource} buf, ${I.MiniTextureProvider} tex) {
                ((${context}) this.context).refresh(info); }`)
            .addMethod(`public void postRender(${I.MiniInfo} info, ${I.BufferSource} buf, ${I.MiniTextureProvider} tex) {}`)
            .addMethod(`public boolean renderElement(
                ${I.Object} el, boolean hovered, boolean highlighted, double depth, float screenSizeBasedScale,
                double localX, double localY, ${I.MiniInfo} info, ${I.GuiGraphics} graphics, ${I.BufferSource} buf) {
                if (el == null || graphics == null || info == null) return false;
                if (!((${context}) this.context).enabled()) return false;

                ${element} e = (${element}) el;
                if (e.render == null) return false;

                double scale = ((${context}) this.context).zoomScale();
                if (!${I.Double}.isFinite(scale) || scale <= 0.0 || scale > 64.0) scale = 1.0;

                try {
                    ${I.Object}[] args = new ${I.Object}[7];
                    args[0] = graphics;
                    args[1] = e;
                    args[2] = ${I.Double}.valueOf(localX);
                    args[3] = ${I.Double}.valueOf(localY);
                    args[4] = info;
                    args[5] = ${I.Double}.valueOf(scale);
                    args[6] = ${I.Boolean}.FALSE;
                    ${I.Object} result = e.render.apply(args);
                    return (result instanceof ${I.Boolean}) && ((${I.Boolean}) result).booleanValue();
                } catch (${I.Throwable} t) {
                    return false;
                } }`)
            .finishBuildAndFreeze()
        return Reflection.getClassFromClassBuilderResult(name)
    }

    // ==================== 世界地图 ====================
    static createWorldMapContextClass() {
        const name = this.WORLDMAP.Context
        let exist = this.load(name)
        if (exist) return exist

        const I = this.IMPORT
        Reflection.createClassBuilder(name, Java.type(I.Object))
            .addField(`private ${I.List} elements = ${I.Collections}.synchronizedList(new ${I.ArrayList}());`)
            .addField(`private boolean enabled = true;`)
            .addConstructor(`public ${name}() { super(); }`)
            .addMethod(`public ${I.List} elements() { return this.elements; }`)
            .addMethod(`public boolean enabled() { return this.enabled; }`)
            .addMethod(`public void setEnabled(boolean v) { this.enabled = v; }`)
            .finishBuildAndFreeze()
        return Reflection.getClassFromClassBuilderResult(name)
    }
    static createWorldMapProviderClass() {
        const name = this.WORLDMAP.Provider
        let exist = this.load(name)
        if (exist) return exist

        const I = this.IMPORT
        let context = this.className(this.WORLDMAP.Context)
        Reflection.createClassBuilder(name, Java.type(I.WorldProvider))
            .addField(`private ${I.Iterator} iterator = ${I.Collections}.emptyIterator();`)
            .addConstructor(`public ${name}() { super(); }`)
            .addMethod(`public void begin(${I.WorldLocation} location, ${I.Object} ctx) {
                this.iterator = ((${context}) ctx).elements().iterator(); }`)
            .addMethod(`public boolean hasNext(${I.WorldLocation} location, ${I.Object} ctx) { return this.iterator.hasNext(); }`)
            .addMethod(`public ${I.Object} getNext(${I.WorldLocation} location, ${I.Object} ctx) {
                return this.iterator.hasNext() ? this.iterator.next() : null; }`)
            .addMethod(`public void end(${I.WorldLocation} location, ${I.Object} ctx) {
                this.iterator = ${I.Collections}.emptyIterator(); }`)
            .finishBuildAndFreeze()
        return Reflection.getClassFromClassBuilderResult(name)
    }
    static createWorldMapReaderClass() {
        const name = this.WORLDMAP.Reader
        let exist = this.load(name)
        if (exist) return exist

        const I = this.IMPORT
        let element = this.className(this.ELEMENT)
        Reflection.createClassBuilder(name, Java.type(I.WorldReader))
            .addConstructor(`public ${name}() { super(); }`)
            .addMethod(`public boolean isHidden(${I.Object} e, ${I.Object} c) { return e == null; }`)
            .addMethod(`public double getRenderX(${I.Object} e, ${I.Object} c, float p) { return ((${element}) e).centerX(); }`)
            .addMethod(`public double getRenderZ(${I.Object} e, ${I.Object} c, float p) { return ((${element}) e).centerZ(); }`)
            .addMethod(`public int getInteractionBoxLeft(${I.Object} e, ${I.Object} c, float p) { return -8; }`)
            .addMethod(`public int getInteractionBoxRight(${I.Object} e, ${I.Object} c, float p) { return 8; }`)
            .addMethod(`public int getInteractionBoxTop(${I.Object} e, ${I.Object} c, float p) { return -8; }`)
            .addMethod(`public int getInteractionBoxBottom(${I.Object} e, ${I.Object} c, float p) { return 8; }`)
            .addMethod(`public int getRenderBoxLeft(${I.Object} e, ${I.Object} c, float p) { return -8; }`)
            .addMethod(`public int getRenderBoxRight(${I.Object} e, ${I.Object} c, float p) { return 8; }`)
            .addMethod(`public int getRenderBoxTop(${I.Object} e, ${I.Object} c, float p) { return -8; }`)
            .addMethod(`public int getRenderBoxBottom(${I.Object} e, ${I.Object} c, float p) { return 8; }`)
            .addMethod(`public int getLeftSideLength(${I.Object} e, ${I.Minecraft} mc) { return 16; }`)
            .addMethod(`public ${I.String} getMenuName(${I.Object} e) { return ""; }`)
            .addMethod(`public ${I.String} getFilterName(${I.Object} e) { return ""; }`)
            .addMethod(`public int getMenuTextFillLeftPadding(${I.Object} e) { return 0; }`)
            .addMethod(`public int getRightClickTitleBackgroundColor(${I.Object} e) { return 0; }`)
            .addMethod(`public boolean shouldScaleBoxWithOptionalScale() { return false; }`)
            .finishBuildAndFreeze()
        return Reflection.getClassFromClassBuilderResult(name)
    }
    static createWorldMapRendererClass() {
        const name = this.WORLDMAP.Renderer
        let exist = this.load(name)
        if (exist) return exist

        const I = this.IMPORT
        let element = this.className(this.ELEMENT)
        let context = this.className(this.WORLDMAP.Context)
        let reader = this.className(this.WORLDMAP.Reader)
        let provider = this.className(this.WORLDMAP.Provider)
        Reflection.createClassBuilder(name, Java.type(I.WorldRenderer))
            .addConstructor(`public ${name}(${context} ctx, ${provider} provider, ${reader} reader) { super(ctx, provider, reader); }`)
            .addMethod(`public boolean shouldRender(${I.WorldLocation} location, boolean shadow) { return true; }`)
            .addMethod(`public int getOrder() { return 200; }`)
            .addMethod(`public boolean shouldBeDimScaled() { return false; }`)
            .addMethod(`public void preRender(${I.WorldInfo} info, ${I.BufferSource} buf, ${I.WorldTextureProvider} rp, boolean shadow) {}`)
            .addMethod(`public void postRender(${I.WorldInfo} info, ${I.BufferSource} buf, ${I.WorldTextureProvider} rp, boolean shadow) {}`)
            .addMethod(`public void renderElementShadow(${I.Object} e, boolean h, float os, double px, double py,
                ${I.WorldInfo} info, ${I.GuiGraphics} g, ${I.BufferSource} buf, ${I.WorldTextureProvider} rp) {}`)
            .addMethod(`public boolean renderElement(
                ${I.Object} element, boolean hovered, double optionalDepth, float optionalScale, double partialX, double partialY,
                ${I.WorldInfo} info, ${I.GuiGraphics} graphics, ${I.BufferSource} bufferSource, ${I.WorldTextureProvider} rendererProvider) {
                if (!((${context}) this.context).enabled()) return false;
                ${element} el = (${element}) element;
                if (el == null || el.render == null) return false;
                if (info == null || graphics == null) return false;
                try {
                    double mapScale = info.scale;
                    if (!${I.Double}.isFinite(mapScale) || mapScale <= 0.0 || mapScale > ${I.Float}.MAX_VALUE) mapScale = 1.0;
                    ${I.Object}[] args = new ${I.Object}[7];
                    args[0] = graphics;
                    args[1] = el;
                    args[2] = ${I.Double}.valueOf(partialX);
                    args[3] = ${I.Double}.valueOf(partialY);
                    args[4] = info;
                    args[5] = ${I.Double}.valueOf(mapScale);
                    args[6] = ${I.Boolean}.TRUE;
                    ${I.Object} result = el.render.apply(args);
                    return (result instanceof ${I.Boolean}) && ((${I.Boolean}) result).booleanValue();
                } catch (${I.Throwable} t) {
                    return false;
                } }`)
            .finishBuildAndFreeze()
        return Reflection.getClassFromClassBuilderResult(name)
    }
}

/** 渲染层管理器（小地图 + 世界地图） */
class XaeroOverlayManager {
    constructor() {
        /** @type {JavaClass|null} 共用 Element 类 */
        this.ElementCls = null

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
        this.minimapHandler = Java.type(ModBuilder.IMPORT.Minimap).instance.getMinimap().getOverMapRendererHandler()

        const contextCls = ModBuilder.createMinimapContextClass()
        ModBuilder.createMinimapProviderClass()
        ModBuilder.createMinimapReaderClass()
        const rendererCls = ModBuilder.createMinimapRendererClass()

        this.minimapContext = Reflection.newInstance(contextCls)
        this.minimapRenderer = Reflection.newInstance(rendererCls, this.minimapContext)
        this.minimapHandler.add(this.minimapRenderer)

        this.minimapInited = true
        mclog('小地图渲染层已注册')
        return this
    }

    /** 注册世界地图渲染层 */
    registerWorldMap() {
        if (this.worldMapInited) return this
        this.worldMapHandler = Java.type(ModBuilder.IMPORT.WorldMap).mapElementRenderHandler

        const contextCls = ModBuilder.createWorldMapContextClass()
        const providerCls = ModBuilder.createWorldMapProviderClass()
        const readerCls = ModBuilder.createWorldMapReaderClass()
        const rendererCls = ModBuilder.createWorldMapRendererClass()

        this.worldMapContext = Reflection.newInstance(contextCls)
        const provider = Reflection.newInstance(providerCls)
        const reader = Reflection.newInstance(readerCls)
        this.worldMapRenderer = Reflection.newInstance(rendererCls, this.worldMapContext, provider, reader)

        this.worldMapHandler.add(this.worldMapRenderer)
        this.worldMapInited = true
        mclog('世界地图渲染层已注册')
        return this
    }

    /** 注册所有渲染层 */
    register() {
        this.ElementCls = ModBuilder.createElementClass()
        this.registerMinimap()
        this.registerWorldMap()
        return this
    }

    /** 从渲染管线移除 */
    unregister() {
        if (this.minimapInited) {
            const cls = Reflection.getClass(ModBuilder.IMPORT.MiniRendererHandler)
            const f = Reflection.getDeclaredField(cls, 'renderers')
            f.setAccessible(true)
            f.get(this.minimapHandler).remove(this.minimapRenderer)
            this.minimapInited = false
            this.minimapRenderer = null
            this.minimapContext = null
        }

        if (this.worldMapInited) {
            const f = this.worldMapHandler.getClass().getDeclaredField('renderers')
            f.setAccessible(true)
            if (f != null) f.get(this.worldMapHandler).remove(this.worldMapRenderer)
            this.worldMapInited = false
            this.worldMapRenderer = null
            this.worldMapContext = null
        }

        mclog('渲染层已卸载')
        return true
    }

    /**
     * 添加一个高亮元素
     * @param {number} cx 区块 X
     * @param {number} cz 区块 Z
     * @param {number} [color=0x80FF0000] ARGB 颜色
     * @param {number} [size=16] 尺寸（方块单位）
     * @param {Function|null} [render=null] 元素渲染回调
     * @returns {object} 元素实例
     */
    addElement(cx, cz, color = 0x80FF0000, size = 16, render = null) {
        if (!this.minimapInited && !this.worldMapInited) throw new Error('XaeroOverlayManager 未 register')

        const ElementCls = this.ElementCls
        if (this.minimapInited) {
            const el = Reflection.newInstance(ElementCls, cx | 0, cz | 0, color | 0, size | 0, render)
            this.minimapContext.elements().add(el)
        }
        if (this.worldMapInited) {
            const el = Reflection.newInstance(ElementCls, cx | 0, cz | 0, color | 0, size | 0, render)
            this.worldMapContext.elements().add(el)
        }
    }

    /**
     * 移除一个元素
     * @param {object} handle addElement 返回的元素实例
     * @returns {boolean} 是否移除成功
     */
    removeElement(handle) {
        if (!handle) return false
        let removed = false
        if (this.minimapInited) removed = this.minimapContext.elements().remove(handle) || removed
        if (this.worldMapInited) removed = this.worldMapContext.elements().remove(handle) || removed
        return removed
    }

    /** 清空所有元素 */
    clearElements() {
        if (this.minimapInited) this.minimapContext.elements().clear()
        if (this.worldMapInited) this.worldMapContext.elements().clear()
    }

    /** 小地图元素数量 @returns {number} */
    get minimapSize() { return this.minimapInited ? this.minimapContext.elements().size() : 0 }

    /** 世界地图元素数量 @returns {number} */
    get worldMapSize() { return this.worldMapInited ? this.worldMapContext.elements().size() : 0 }

    setEnabled(v) {
        if (this.minimapInited) this.minimapContext.setEnabled(!!v)
        if (this.worldMapInited) this.worldMapContext.setEnabled(!!v)
    }
    isEnabled() {
        return (this.minimapInited && this.minimapContext.enabled())
            || (this.worldMapInited && this.worldMapContext.enabled())
    }
    toggle() {
        const now = !this.isEnabled()
        this.setEnabled(now)
        return now
    }
}

/** 初始化：构建渲染层并添加示例元素 */
function setup() {
    const d2d = Hud.createDraw2D()
    const render = DeobfRef.methodName(ModBuilder.IMPORT.Renderable, 'render', 'method_25394', 'm_88315_')
    const angle = () => -90 - Player.getPlayer().getYaw()

    // 矩形：跟随地图
    const rectFollowMap = JavaWrapper.methodToJava((args) => {
        try {
            const [graphics, e, localX, localY, info, scale, isWorldMap] = args
            const half = (e.size / 2) * scale
            const deg = isWorldMap ? 0 : angle()

            const rect = d2d.rectBuilder()
                .pos((localX - half) | 0, (localY - half) | 0, (localX + half) | 0, (localY + half) | 0)
                .color(e.color).alpha(50).rotation(deg)
                .build()
            rect.setRotateCenter(true)
            rect[render](graphics, 0, 0, 0)
        } catch (e) { Chat.log(e) }
        return true
    })

    // 矩形：固定 45°
    const rectFixed45 = JavaWrapper.methodToJava((args) => {
        try {
            const [graphics, e, localX, localY, info, scale, isWorldMap] = args
            const half = (e.size / 2) * scale

            const rect = d2d.rectBuilder()
                .pos((localX - half) | 0, (localY - half) | 0, (localX + half) | 0, (localY + half) | 0)
                .color(e.color).alpha(50).rotation(45)
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
            const [graphics, e, localX, localY, info, scale, isWorldMap] = args
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

        overlay.addElement(pcx + 3, pcz, 0x8000FF00, 16, rectFixed45)
        overlay.addElement(pcx, pcz, 0x800000FF, 16, imageRender)
    }
}

/** 清理：从 Xaero 渲染管线卸载 */
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
    setToggle(true)
    event.stopListener = JavaWrapper.methodToJava(() => {
        setToggle(false)
        teardown()
    })
} catch {
    setToggle(!isToggle())
}

if (isToggle()) {
    setup()

    while (isToggle()) {
        Client.waitTick()
    }
    teardown()
}
