// 脚本名称: RS终端操作
// 功能介绍: 获取鼠标聚焦的物品信息，包括收藏夹、配方侧边栏
// 依赖模组: 宏(jsmacros)、RS 精致存储(Refined Storage)
// 创建时间: 2026-08-05
// 修改时间: 2026-08-05
// 更新内容: v1.0 初始化脚本

const scriptName = 'RSUtils.ToggleScript'
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

class GridStack {
    /** 库存物品元素
     * @param {com.refinedmods.refinedstorage.screen.grid.stack.IGridStack} stack 
     */
    constructor(stack) {
        /** @type {com.refinedmods.refinedstorage.screen.grid.stack.IGridStack} */
        this.stack = stack
    }
    /** 获取物品库存uuid @returns {java.util.UUID} */
    getUUID() { return this.stack.getId() }
    /** 获取物品元数据 @returns {ItemStack} */
    getIngredient() { return this.stack.getIngredient() }
    /** 获取物品id @returns {string} */
    getId() {
        return this.isFluid() ?
            this.getIngredient().getFluid().getFluidType() :
            JavaUtils.getHelperFromRaw(this.getIngredient()).getItem().getId()
    }
    /** 获取物品名称 @returns {string} */
    getName() { return this.stack.getName() }
    /** 获取库存数量 @returns {int} */
    getQuantity() { return this.stack.getQuantity() }
    /** 获取格式化的库存数量 @returns {string} */
    getFormattedFullQuantity() { return this.stack.getFormattedFullQuantity() }
    /** 是否可自动合成 @returns {bool} */
    isCraftable() { return this.stack.isCraftable() }
    /** 是否流体 @returns {bool} */
    isFluid() { return !(this.getIngredient() instanceof RSUtils.ItemStack) }
}

class RSUtils {
    /**
     * @type {com.refinedmods.refinedstorage.screen.grid.GridScreen}
     * @link https://github.com/refinedmods/refinedstorage/blob/develop/src/main/java/com/refinedmods/refinedstorage/screen/grid/GridScreen.java
    */
    static GridScreen = Java.type('com.refinedmods.refinedstorage.screen.grid.GridScreen')
    /** @type {com.refinedmods.refinedstorage.RS} */
    static RS = Java.type('com.refinedmods.refinedstorage.RS')
    /** @type {com.refinedmods.refinedstorage.api.storage.StorageType} */
    static GridType = Java.type('com.refinedmods.refinedstorage.api.network.grid.GridType')
    /** @type {com.refinedmods.refinedstorage.network.grid.GridItemPullMessage} */
    static GridItemPullMessage = Java.type('com.refinedmods.refinedstorage.network.grid.GridItemPullMessage')
    /** @type {com.refinedmods.refinedstorage.network.grid.GridItemInsertHeldMessage} */
    static GridItemInsertHeldMessage = Java.type('com.refinedmods.refinedstorage.network.grid.GridItemInsertHeldMessage')
    /** @type {com.refinedmods.refinedstorage.network.grid.GridFluidPullMessage} */
    static GridFluidPullMessage = Java.type('com.refinedmods.refinedstorage.network.grid.GridFluidPullMessage')
    /** @type {com.refinedmods.refinedstorage.network.grid.GridFluidInsertHeldMessage} */
    static GridFluidInsertHeldMessage = Java.type('com.refinedmods.refinedstorage.network.grid.GridFluidInsertHeldMessage')
    /** @type {com.refinedmods.refinedstorage.network.grid.GridItemGridScrollMessage} */
    static GridItemGridScrollMessage = Java.type('com.refinedmods.refinedstorage.network.grid.GridItemGridScrollMessage')
    // /** @type {com.refinedmods.refinedstorage.network.grid.GridItemInventoryScrollMessage} */
    // static GridItemInventoryScrollMessage = Java.type('com.refinedmods.refinedstorage.network.grid.GridItemInventoryScrollMessage')
    /** @type {net.minecraft.world.item.ItemStack} */
    static ItemStack = Java.type('net.minecraft.world.item.ItemStack')

    constructor() {
        /** 终端容器实例 @type {RSUtils.GridScreen} */
        this.screen = Player.openInventory().getRawContainer()
        if (!(this.screen instanceof RSUtils.GridScreen))
            throw new Error(`${this.screen} 不是RS终端`)
        /** 库存视图
         * @type {com.refinedmods.refinedstorage.screen.grid.view}
         * @link https://github.com/refinedmods/refinedstorage/blob/develop/src/main/java/com/refinedmods/refinedstorage/screen/grid/view/IGridView.java
         */
        this.view = this.screen.getView()
        /** 库存操作类
         * @type {com.refinedmods.refinedstorage.api.network.grid.IGrid}
         * @link https://github.com/refinedmods/refinedstorage/blob/develop/src/main/java/com/refinedmods/refinedstorage/api/network/grid/IGrid.java
         */
        this.grid = this.screen.getGrid()
    }
    /** 获取库存数据
     * @returns {java.util.List<com.refinedmods.refinedstorage.screen.grid.stack.IGridStack>}
     */
    getStacks() { return this.view.getStacks() }
    /** 点击坐标
     * @param {double} mouseX
     * @param {double} mouseY
     * @param {int} clickedButton 0 左键 / 1 右键
     * @returns {bool} 点击结果
     */
    mouseClicked(mouseX, mouseY, clickedButton) { return this.screen.mouseClicked(mouseX, mouseY, clickedButton) }
    /** 滚动鼠标滚轮
     * @param {double} x 
     * @param {double} y 
     * @param {double} z 
     * @param {double} delta 
     * @returns {bool} 滚动结果
     */
    mouseScrolled(x, y, z, delta) { return this.screen.mouseScrolled(x, y, z, delta) }
    /** 按照id搜索物品
     * @param {string} itemid 物品id
     * @returns {GridStack}
     */
    findById(itemid) {
        for (let item of this.getStacks()) {
            let stack = new GridStack(item)
            if (itemid instanceof RegExp ? itemid.test(stack.getId()) : stack.getId() == itemid)
                return stack
        }
        return null
    }
    /** 是否流体终端 @returns {bool} */
    isFluid() { return this.grid.getGridType() == RSUtils.GridType.FLUID }
    /** 提取物品
     * @param {java.util.UUID} itemid 物品id
     * @param {int} mousebutton 0 左键 / 1 右键
     * @param {bool} shiftdown 是否按下shift键
     */
    pull(uuid, mousebutton, shiftdown) {
        let packet = this.isFluid() ? 
            new RSUtils.GridFluidPullMessage(uuid, shiftdown):
            new RSUtils.GridItemPullMessage(uuid, mousebutton | (shiftdown ? 4: 0))
        RSUtils.RS.NETWORK_HANDLER.sendToServer(packet)
    }
    /** 鼠标提取物品
     * @param {GridStack} stack 库存元素
     * @param {int} mousebutton 0 左键 / 1 右键
     * @param {bool} shiftdown 是否按下shift键
     */
    pullStack(stack, mousebutton = 0, shiftdown = false) {
        this.pull(stack.getUUID(), mousebutton, shiftdown)
    }
    /** 滚轮提取/放入1个物品
     * @param {java.util.UUID} uuid 库存元素序列号
     * @param {bool} add true 增加库存 / false 减少库存
     * @param {bool} ctrldown true 提取到鼠标 / false 提取到背包
     */
    scroll(uuid, add = false, ctrldown = false) {
        let packet = new RSUtils.GridItemGridScrollMessage(uuid, !ctrldown, add)
        RSUtils.RS.NETWORK_HANDLER.sendToServer(packet)
    }
    /** 滚轮提取/放入1个物品
     * @param {GridStack} itemstack 库存元素
     * @param {bool} add true 增加库存 / false 减少库存
     * @param {bool} ctrldown true 提取到鼠标 / false 提取到背包
     */
    scrollStack(itemstack, add = false, ctrldown = false) {
        this.scroll(itemstack.getUUID(), add, ctrldown)
    }
}

let debug = true
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
        let raw_inv = inv.getRawContainer()
        if (raw_inv instanceof RSUtils.GridScreen) {
            // flog(`[${new Date().toLocaleTimeString()}] ${raw_inv}\n`)
            let rs = new RSUtils()
            let stacks = rs.getStacks()
            if (!isaction) {
                // flog(Array.from(rs.getStacks()).map(v => {
                //     let stack = new GridStack(v)
                //     return `  - ${stack.getUUID()}: ${stack.getId()} ${stack.getName()} ${stack.getFormattedFullQuantity()}\n`
                // }).join(''))
                let stack = rs.findById(/minecraft:string/)
                if (stack) {
                    flog(`  - ${stack.getUUID()}: ${stack.getId()} ${stack.getName()} ${stack.getFormattedFullQuantity()}\n`)
                    Client.waitTick(2)
                    rs.pullStack(stack, 1, true)
                    Client.waitTick(2)
                    rs.scrollStack(stack, true, false)
                }
                isaction = true
            }

            infos = [
                `终端: ${raw_inv}`,
                `物品种类数: ${stacks.size()}`,
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
