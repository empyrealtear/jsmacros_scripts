// 脚本名称: AE2终端操作
// 功能介绍: 获取鼠标聚焦的物品信息，包括收藏夹、配方侧边栏
// 依赖模组: 宏(jsmacros)、AE2 应用能源2(Applied Energistics 2)
// 创建时间: 2026-08-04
// 修改时间: 2026-08-05
// 更新内容: v1.0 初始化脚本

const scriptName = 'AE2Utils.ToggleScript'
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

function GetClass(class_names) {
    for (let item of class_names)
        try { return Java.type(item) } catch { }
    return null
}
function InvokeMethod(obj, method_names, ...args) {
    for (let item of method_names)
        if (item in obj)
            return obj[item](...args)
    return null
}

class GridInventoryEntry {
    /** 库存元素方法实例
     * @param {appeng.menu.me.common.GridInventoryEntry} 
     * @link https://github.com/AppliedEnergistics/Applied-Energistics-2/blob/main/src/main/java/appeng/menu/me/common/GridInventoryEntry.java
     */
    constructor(entry) {
        /** @type {appeng.menu.me.common.GridInventoryEntry} */
        this.entry = entry
    }
    /** 序列号 @returns {long} */
    getSerial() { return this.entry.getSerial() }
    /** 库存物品信息
     * @returns {appeng.api.stacks.AEKey}
     * @link https://github.com/AppliedEnergistics/Applied-Energistics-2/blob/main/src/main/java/appeng/api/stacks/AEKey.java
     */
    getWhat() { return this.entry.getWhat() }
    /** 获取物品id @returns {net.minecraft.resources.Identifier} */
    getId() { return this.entry.getWhat().getId() }
    /** 获取物品名称 @returns {string} */
    getDisplayName() { return this.entry.getWhat().entry.getWhat().getDisplayName().getString() }
    /** 当前存储数量 @returns {long} */
    getStoredAmount() { return this.entry.getStoredAmount() }
    /** 可从外部网络（即物流管道）请求的数量 @returns {long} */
    getRequestableAmount() { return this.entry.getRequestableAmount() }
    /** 是否可自动合成 @returns {bool} */
    isCraftable() { return this.entry.isCraftable() }
    /** 若此条目仍然存在，则为true，否则为已删除 @returns {bool} */
    isMeaningful() { return this.entry.isMeaningful() }
}

class AE2Utils {
    /** @type {appeng.client.gui.me.common.MEStorageScree} */
    static MEStorageScreen = Java.type('appeng.client.gui.me.common.MEStorageScreen')
    /** @type {appeng.helpers.InventoryAction} */
    static InventoryAction = Java.type('appeng.helpers.InventoryAction')
    static Action = {
        /** 原版通用 - 中键点击（仅限创造）：复制一组物品 */
        CREATIVE_DUPLICATE: AE2Utils.InventoryAction.CREATIVE_DUPLICATE,
        /** 原版通用 - 左键点击：提取一组到鼠标 / 放下鼠标物品 */
        PICKUP_OR_SET_DOWN: AE2Utils.InventoryAction.PICKUP_OR_SET_DOWN,
        /** 原版通用 - 右键点击：提取一半到鼠标 / 放下一个 */
        SPLIT_OR_PLACE_SINGLE: AE2Utils.InventoryAction.SPLIT_OR_PLACE_SINGLE,
        /** 原版通用 - Shift+左键：提取一组到背包 */
        SHIFT_CLICK: AE2Utils.InventoryAction.SHIFT_CLICK,
        /** 扩展操作 - Shift+右键：提取一个到鼠标 */
        PICKUP_SINGLE: AE2Utils.InventoryAction.PICKUP_SINGLE,
        /** 合成终端 - 合成结果右键：合成一组到鼠标*/
        CRAFT_STACK: AE2Utils.InventoryAction.CRAFT_STACK,
        /** 合成终端 - 点击合成结果：合成一个到鼠标 */
        CRAFT_ITEM: AE2Utils.InventoryAction.CRAFT_ITEM,
        /** 合成终端 - Shift+点击合成结果：合成一组到背包 */
        CRAFT_SHIFT: AE2Utils.InventoryAction.CRAFT_SHIFT,
        /** 合成终端 - 合成全部：合成尽可能多的数量（填满背包） */
        CRAFT_ALL: AE2Utils.InventoryAction.CRAFT_ALL,
        /** 流体操作 - 左键点击流体：填充手中容器（1桶） */
        FILL_ITEM: AE2Utils.InventoryAction.FILL_ITEM,
        /** 流体操作 - Shift + 左键点击流体：填充手中容器并移到背包 */
        FILL_ITEM_MOVE_TO_PLAYER: AE2Utils.InventoryAction.FILL_ITEM_MOVE_TO_PLAYER,
        /** 流体操作 - 填充手中容器（全部） */
        FILL_ENTIRE_ITEM: AE2Utils.InventoryAction.FILL_ENTIRE_ITEM,
        /** 流体操作 - 填充手中容器（全部）并移到背包 */
        FILL_ENTIRE_ITEM_MOVE_TO_PLAYER: AE2Utils.InventoryAction.FILL_ENTIRE_ITEM_MOVE_TO_PLAYER,
        /** 流体操作 - 右键点击空容器（如空桶）：将容器内容物存入网络（1桶） */
        EMPTY_ITEM: AE2Utils.InventoryAction.EMPTY_ITEM,
        /** 流体操作 - Shift + 右键点击空容器：将容器内容物全部存入网络 */
        EMPTY_ENTIRE_ITEM: AE2Utils.InventoryAction.EMPTY_ENTIRE_ITEM,
        /** 扩展操作 - 空格 + 点击：移动同区域所有物品（背包栏/快捷栏） */
        MOVE_REGION: AE2Utils.InventoryAction.MOVE_REGION,
        /** 扩展操作 - 鼠标滚轮向上：向上滚动（调整数量） */
        ROLL_UP: AE2Utils.InventoryAction.ROLL_UP,
        /** 扩展操作 - 鼠标滚轮向下：向下滚动（调整数量） */
        ROLL_DOWN: AE2Utils.InventoryAction.ROLL_DOWN,
        /** 扩展操作 - 左键点击可合成物品（无库存时）：自动合成该物品 */
        AUTO_CRAFT: AE2Utils.InventoryAction.AUTO_CRAFT,
        /** 扩展操作 - 右键点击空白槽：放一个到槽位 */
        PLACE_SINGLE: AE2Utils.InventoryAction.PLACE_SINGLE,
        /** 过滤设置 - 设置过滤器槽 */
        SET_FILTER: AE2Utils.InventoryAction.SET_FILTER,
    }
    constructor() {
        /** 终端容器实例
         * @type {appeng.client.gui.me.common.MEStorageScreen}
         * @link https://github.com/AppliedEnergistics/Applied-Energistics-2/blob/main/src/client/java/appeng/client/gui/me/common/MEStorageScreen.java
         */
        this.screen = Player.openInventory().getRawContainer()
        if (!(this.screen instanceof AE2Utils.MEStorageScreen))
            throw new Error(`${this.screen} 不是AE2终端`)
        /** 容器操作类，来自net.minecraft.client.gui.screens.inventory.AbstractContainerScreen#getMenu()
         * @type {appeng.menu.me.common.MEStorageMenu}
         * @link https://github.com/AppliedEnergistics/Applied-Energistics-2/blob/main/src/main/java/appeng/menu/me/common/MEStorageMenu.java
         * @link https://mappings.dev/1.20.1/net/minecraft/client/gui/screens/inventory/AbstractContainerScreen.html
         */
        this.menu = InvokeMethod(this.screen, ['getMenu', 'method_17577', 'getScreenHandler', 'm_6262_'])
        /** 控制器网络存储的物品清单
         * @type {appeng.client.gui.me.common.Repo}
         * @link https://github.com/AppliedEnergistics/Applied-Energistics-2/blob/main/src/client/java/appeng/client/gui/me/common/Repo.java
         */
        this.repo = this.menu.getClientRepo()
        // this.repo = Reflection.getReflect(inventory).field('repo').get()
    }
    /** 获取库存集合
     * @returns {Set<appeng.menu.me.common.GridInventoryEntry>} 库存元素集合
     * @link https://github.com/AppliedEnergistics/Applied-Energistics-2/blob/main/src/main/java/appeng/menu/me/common/GridInventoryEntry.java
     */
    getAllEntries() { return this.repo?.getAllEntries() }
    /** 鼠标点击
     * @param {net.minecraft.client.input.MouseButtonEvent} event 
     * @param {bool} doubleClick 双击鼠标
     * @returns {bool} 点击结果
     */
    mouseClicked(event, doubleClick = false) { return this.screen.mouseClicked(event, doubleClick) }
    /** 鼠标滚轮
     * @param {double} x 
     * @param {double} y 
     * @param {double} deltaX 
     * @param {double} deltaY 
     * @returns {bool} 滚动结果
     */
    mouseScrolled(x, y, deltaX, deltaY) { return this.screen.mouseScrolled(x, y, deltaX, deltaY) }
    /** 获取指定id库存元素
     * @param {string} itemid 物品id
     * @returns {GridInventoryEntry | null} 库存元素
     */
    findbyId(itemid) {
        for (let entry of this.getAllEntries()) {
            let stack = new GridInventoryEntry(entry)
            if (itemid instanceof RegExp ? itemid.test(stack.getId()) : stack.getId() == itemid)
                return stack
        }
        return null
    }
    /** 操作指定序列号元素
     * @param {long} serial 序列号
     * @param {appeng.helpers.InventoryAction} action 操作类型
     */
    handleInteraction(serial, action) { this.menu.handleInteraction(serial, action) }
}

let debug = false
const flog = (val) => {
    if (debug)
        FS.open("jsmlogs.txt").append(val)
}

function main() {
    let infos = ['终端:', '物品种类数:']
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
    let isaction = false

    while (isToggle()) {
        let inv = Player.openInventory()
        let ae2_inv = inv.getRawContainer()
        if (ae2_inv instanceof AE2Utils.MEStorageScreen) {
            flog(`[${new Date().toLocaleTimeString()}] ${ae2_inv}\n`)
            const ae2 = new AE2Utils(ae2_inv)
            let entries = ae2.getAllEntries()
            for (let entry of entries) {
                flog(`  - ${entry.getSerial()}`
                    + ` ${entry.getWhat().getId()}: ${entry.getWhat().getDisplayName().getString()}`
                    + ` ${entry.getStoredAmount()}\n`)
            }
            if (!isaction) {
                let entry = ae2.findbyId('minecraft:oak_planks')
                let action = AE2Utils.Action.PICKUP_OR_SET_DOWN
                ae2.handleInteraction(entry.getSerial(), action)
                flog(`${entry.getSerial()} ${action}\n`)
                isaction = true
            }
            infos = [
                `终端: ${ae2_inv}`,
                `物品种类数: ${entries.size()}`,
            ]
            for (let i = 0; i < infos.length; i++)
                display_panel[i]?.setText(infos[i])
        } else {
            isaction = false
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
