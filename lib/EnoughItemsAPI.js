// 脚本名称: JEI/REI聚焦物品信息
// 功能介绍: 获取鼠标聚焦的物品信息，包括收藏夹、配方侧边栏
// 依赖模组: 宏(jsmacros)、JEI物品管理器(JustEnoughItems)或REI物品管理器(RoughlyEnoughItems)
// 创建时间: 2026-08-02
// 修改时间: 2026-08-03
// 更新内容: v1.0 初始化脚本

const scriptName = 'EnoughItemsAPI.ToggleScript'
const mclog = (msg, prefixColor = 0x5, msgColor = 0x7) => {
    Chat.log(Chat.createTextBuilder()
        .append("[").withColor(prefixColor)
        .append(scriptName).withColor(prefixColor)
        .append("]").withColor(prefixColor)
        .append(" " + msg).withColor(msgColor).build())
}
const isToggle = () => GlobalVars.getBoolean(scriptName)
const setToggle = (value) => {
    GlobalVars.putBoolean(scriptName, value)
    mclog(value ? "脚本启用" : "脚本关闭")
}
setToggle(!isToggle())

const tryGetClass = (class_name, default_value = null) => {
    try {
        return Java.type(class_name)
    } catch {
        return default_value
    }
}

class EnoughItemsAPI {
    constructor() {
        this.Types = {
            JEI: 'JustEnoughItems',
            REI: 'RoughlyEnoughItems',
            None: ''
        }
        this.type = this.Types.NeoForgeGuiPlugin
        this.class = {}
        this.init()
    }

    init() {
        // JEI接口类: https://github.com/mezz/JustEnoughItems
        let ref_class = {
            // mezz.jei.Internal：[1.8.9-1.17]
            // mezz.jei.common.Internal：[1.18-1.19], 1.20.1, >=1.21.1
            Internal: tryGetClass('mezz.jei.Internal', tryGetClass('mezz.jei.common.Internal')),
            // 备用方法
            FabricGuiPlugin: tryGetClass('mezz.jei.fabric.plugins.fabric.FabricGuiPlugin'),
            ForgeGuiPlugin: tryGetClass('mezz.jei.forge.plugins.forge.ForgeGuiPlugin'),
            NeoForgeGuiPlugin: tryGetClass('mezz.jei.neoforge.plugins.neoforge.NeoForgeGuiPlugin'),
        }
        if (Object.values(ref_class).filter(v => v).length > 1) {
            this.type = this.Types.JEI
        } else {
            // REI接口类: https://github.com/shedaniel/RoughlyEnoughItems
            ref_class = {
                ScreenRegistry: tryGetClass('me.shedaniel.rei.api.client.registry.screen.ScreenRegistry'),
                ScreenOverlayImpl: tryGetClass('me.shedaniel.rei.impl.client.gui.ScreenOverlayImpl'),
                Widget: tryGetClass('me.shedaniel.rei.api.client.gui.widgets.Widget'),
            }
            if (Object.values(ref_class).filter(v => !v).length == 0) {
                this.type = this.Types.REI
            }
        }
        if (this.type != this.Types.None) {
            this.class = ref_class
        }
    }

    getDecalaredFieldValue(obj, javaClass, name) {
        if (obj == null) return null
        let field = Reflection.getDeclaredField(javaClass, name)
        field.setAccessible(true)
        return field.get(obj)
    }

    mouse() {
        if (this.type == this.Types.REI)
            return this.class?.Widget?.mouse()
        return { x: Hud.getMouseX(), y: Hud.getMouseY() }
    }
    getClientScreen() {
        // let mc = Client.getMinecraft()
        // return mc.screen ?? mc.currentScreen ?? mc.field_1755 ?? mc.f_91080_
        return Hud.getOpenScreen()
    }
    getEntryListWidget() {
        // 配方栏
        if (this.type == this.Types.JEI) {
            if (this.class?.Internal?.getJeiRuntime)
                return this.class?.Internal?.getJeiRuntime()?.getIngredientListOverlay()
            else if (this.class?.FabricGuiPlugin?.getRuntime)
                return this.class?.FabricGuiPlugin?.getRuntime()?.orElse(null)?.getIngredientListOverlay()
            else if (this.class?.ForgeGuiPlugin?.getResourceReloadHandler) {
                let handler = this.class?.ForgeGuiPlugin?.getResourceReloadHandler()?.orElse(null)
                return handler == null ? null : this.getDecalaredFieldValue(handler,
                    Reflection.getReflect(handler).getClass(), 'ingredientListOverlay')
            }
            else
                return null
        } else if (this.type == this.Types.REI) {
            return this.class?.ScreenOverlayImpl?.getEntryListWidget()
        }
        return null
    }
    getFavoritesListWidget() {
        // 收藏夹
        if (this.type == this.Types.JEI) {
            if (this.class?.Internal?.getJeiRuntime)
                return this.class?.Internal?.getJeiRuntime()?.getBookmarkOverlay()
            else if (this.class?.FabricGuiPlugin?.getRuntime)
                return this.class?.FabricGuiPlugin?.getRuntime()?.orElse(null)?.getBookmarkOverlay()
            else
                return null
        }
        else if (this.type == this.Types.REI) {
            return this.class?.ScreenOverlayImpl?.getFavoritesListWidget()
        }
        return null
    }
    getScreenFocusedStack(screen) {
        if (screen == null) return null
        if (this.type == this.Types.REI) {
            let screenRegistry = this.class.ScreenRegistry?.getInstance()
            let stack = screenRegistry?.getFocusedStack(screen, this.mouse())?.getValue()
            return stack
        }

        let inv = Player.openInventory()
        if (inv) {
            try {
                let slot = inv?.getSlotUnderMouse()
                if (slot < 0) return null
                let stack = inv.getSlot(slot)
                return stack.getCount() == 0 ? null : stack
            } catch { }
        }
        return null
    }
    getWidgetFocusedStack(widget) {
        if (!widget) return null
        let stack = null
        if (this.type == this.Types.JEI) {
            let typedIngredient = widget?.getIngredientUnderMouse()?.orElse(null)
            stack = typedIngredient?.getItemStack()?.orElse(null)
        } else if (this.type == this.Types.REI) {
            let focus_stack = widget?.getFocusedStack()
            stack = (!focus_stack || focus_stack.isEmpty()) ? null : focus_stack?.getValue() ?? null
        }
        return stack
    }
    getFocusedStack() {
        let stack = null
        stack = this.getScreenFocusedStack(this.getClientScreen())
        if (stack) return { type: 'Inventory', stack }
        stack = this.getWidgetFocusedStack(this.getEntryListWidget())
        if (stack) return { type: 'EntryList', stack }
        stack = this.getWidgetFocusedStack(this.getFavoritesListWidget())
        if (stack) return { type: 'FavoritesList', stack }
        return null
    }
    asItemHelper(obj) {
        let itemhelper = JavaUtils.getHelperFromRaw(obj)?.getItem()
        if (!itemhelper) {
            let item = null
            if (obj?.getItem) {
                if (obj?.getItem()?.getId)
                    item = obj?.getItem()?.getId()
                else
                    item = obj?.getItem()
            } else if (obj?.method_7909)
                // https://mappings.dev/1.20.1/net/minecraft/world/item/ItemStack.html
                item = obj?.method_7909()
            if (item)
                itemhelper = Client.getRegistryManager().getItem(`${item}`)
        }
        return itemhelper
    }
}

function main() {
    const viewer = new EnoughItemsAPI()
    let infos = [`模组: ${viewer.type}`, '类型:', '物品:']
    const d2d = Hud.createDraw2D()
    const setting = {
        x: 50, y: d2d.getHeight() - 10,
        color: 0xFFFFFF,
        shadow: true,
        scale: 0.7,
        rotation: 0
    }
    const display_panel = []
    Hud.clearDraw2Ds()
    d2d.setOnInit(JavaWrapper.methodToJava(() => {
        for (let i = 0; i < infos.length; i++) {
            display_panel.push(d2d.addText(
                infos[i],
                setting.x, setting.y - Math.round(setting.scale * 10) * (infos.length - i),
                setting.color, setting.shadow, setting.scale, setting.rotation))
        }
    }))
    d2d.register()

    while (isToggle()) {
        let focus_item = viewer.getFocusedStack()
        if (focus_item) {
            let stackhelper = viewer.asItemHelper(focus_item.stack)
            infos = [
                `模组: ${viewer.type}`,
                `类型: ${focus_item.type}`,
                `物品: ${stackhelper}`
            ]
            for (let i = 0; i < infos.length; i++)
                display_panel[i]?.setText(infos[i])
        }
        Client.waitTick(5)
    }
}

try {
    if (isToggle()) {
        main()
    }
} catch (error) {
    mclog(error)
    setToggle(!isToggle())
} finally {
    Hud.clearDraw2Ds()
}
