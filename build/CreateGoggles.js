// 脚本名称: 机械动力护目镜
// 功能介绍: 直接获取机械动力护目镜查看的机器信息
// 依赖模组: jsmacros、机械动力
// 更新内容: v1.0 初始化脚本

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

try {
    JsMacros.assertEvent(event, 'Service')
    event.stopListener = JavaWrapper.methodToJava(() => { _listener.off(); toggleEnabled(false) })
    toggleEnabled(true)
} catch { toggleEnabled() }

/** 反射工具 @template T */
class DeobfRef {
    /** @param {T} v 被反射包装的对象或 Java 类 */
    constructor(v) {
        /** @type {T} */
        this.target = v
        /** @type {Packages.org.joor.Reflect} */
        this.reflect = Reflection.getReflect(this.target)
    }

    /** @returns {string} 类名 */
    get classname() { return Reflection.getClassName(this.target) }
    /** @returns {JavaClass<T>} 反射版 Java 类 */
    get class() { try { return Reflection.getClass(this.classname) } catch { return null } }
    /** @returns {string[]} 所有字段名（缓存） */
    get fields() { return this._fields ??= this.class?.getDeclaredFields().map(v => v.getName()) ?? [] }

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
}

class Draw2DProxy {
    /** @type {net.minecraft.client.gui.Font} */
    static Font = new DeobfRef(Client.getMinecraft())
        .get('font', 'field_1772', 'textRenderer', 'f_91114_', 'f_91062_')
    /** @type {JavaClass<Draw2D>} */
    static Draw2D = Reflection.getClass(
        'xyz.wagyourtail.jsmacros.client.api.classes.render.Draw2D',
        'com.jsmacrosce.jsmacros.client.api.classes.render.Draw2D')
    /**
     * 创建劫持render的画布
     * @param {(drawContext:DrawContext) => void} [onrender] 每帧渲染回调
     * @returns {Draw2D} 裁剪后的 Draw2D
     */
    static createDraw2D(onrender) {
        let builder = Reflection.createClassProxyBuilder(this.Draw2D)
        builder.addMethod('render', JavaWrapper.methodToJava((proxyRef, args) => {
            try { onrender && onrender(...args) } catch { }
            let result = proxyRef.parent(args)
            return result
        }))
        return builder.buildInstance([])
    }
    /** @param {(self:Draw2DProxy,drawContext:DrawContext) => void} onrender 渲染事件 */
    constructor(onrender) {
        /** @type {(self:Draw2DProxy,drawContext:DrawContext) => void} 渲染事件 */
        this.onrender = onrender
        /** @type {Draw2D} */
        this.target = Draw2DProxy.createDraw2D((ctx) => this.render(ctx))
    }
    /** @param {DrawContext} drawContext */
    render(drawContext) {
        this.onrender && this.onrender(this, drawContext)
    }
}

if (isEnabled()) {
    const RemovedGuiUtils = Java.type('com.simibubi.create.foundation.gui.RemovedGuiUtils')
    const BoxElement = Java.type('net.createmod.catnip.gui.element.BoxElement')
    const GuiGameElement = Java.type('net.createmod.catnip.gui.element.GuiGameElement')
    const Goggles = Client.getRegistryManager().getItemStack('create:goggles').getRaw()

    let scale = Hud.getScaleFactor()
    let w = (Hud.getWindowWidth() / scale) | 0
    let h = (Hud.getWindowHeight() / scale) | 0
    let posX = (w / 2 + 20) | 0, posY = (h / 2) | 0
    const d2d = new Draw2DProxy((self, graphics) => {
        let tooltips = []
        let b = Player.getPlayer()?.rayTraceBlock(6, false)
        let be = b?.getRawBlockEntity()
        if (!be) return
        if (be?.addToGoggleTooltip)
            be.addToGoggleTooltip(tooltips, true)
        if (tooltips.length > 0) {
            GuiGameElement.of(Goggles).at(posX + 10, posY - 16, 450).render(graphics)
            RemovedGuiUtils.drawHoveringText(
                graphics, tooltips, posX, posY, w, h, -1,
                BoxElement.COLOR_VANILLA_BACKGROUND.scaleAlpha(0.75).getRGB(),
                BoxElement.COLOR_VANILLA_BORDER.getFirst().copy().getRGB(),
                BoxElement.COLOR_VANILLA_BORDER.getSecond().copy().getRGB(),
                Draw2DProxy.Font
            )
        }
    })
    d2d.target.register()
    _listener.on(() => { }).offHandle = () => {
        d2d.target.unregister()
    }
}
