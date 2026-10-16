// 脚本名称: 反混淆映射表反射法
// 功能介绍: 使用yarn映射表，反混淆实例字段、方法
// 依赖模组: 宏(jsmacros)、映射反混淆(StackDeobfuscator)
// 创建时间: 2025-03-30
// 修改时间: 2025-03-30
// 当前版本: v1.1
// 更新内容: v1.1 使用yarn名称获取类
// 更新内容: v1.0 初始化脚本

const DeobfReflect = {
    CacheMappings: Java.type('dev.booky.stackdeobf.StackDeobfMod').getMappings(),
    getClassByYarn: function (name) {
        let mapping = this.CacheMappings
        let field = Reflection.getDeclaredField(Reflection.getClass(Reflection.getClassName(mapping)), 'classes')
        field.setAccessible(true)
        let classes = field.get(mapping)
        for (let k of classes.keySet()) {
            if (name.replaceAll(/\//g, '.') == classes.get(k))
                return this.remapObject(Reflection.getClass(`net.minecraft.class_${k}`))
        }
    },
    remapString: function (value) { return this.CacheMappings.remapString(value) },
    find: function (arr, match) {
        if (arr == null)
            return null
        let filter

        if (typeof match == 'string')
            filter = (v) => this.CacheMappings.remapString(v.toString()).includes(match)
        else if (Object.prototype.toString.call(match) == '[object RegExp]')
            filter = (v) => new RegExp(match).test(this.remapString(v.toString()))
        else if (typeof match == 'function')
            filter = match
        else
            throw new TypeError('Unknow Type.')

        return arr.find(filter)
    },
    getFields: function (obj) {
        let cls = Reflection.getClass(clsName)
        return [...cls.getFields(), ...cls.getDeclaredFields()]
    },
    getMethods: function (obj) {
        let cls = Reflection.getClass(Reflection.getClassName(obj))
        return [...cls.getMethods(), ...cls.getDeclaredMethods()]
    },
    findField: function (obj, match) {
        return this.find(this.getFields(obj), match)
    },
    findMethod: function (obj, match) {
        return this.find(this.getMethods(obj), match)
    },

    remapObject: function (obj) {
        if (!(typeof obj == 'object' || typeof obj == 'function'))
            return obj
        let clsName = Reflection.getClassName(obj)
        if (!/class_(\d+)/.test(clsName))
            return obj
        let cls = Reflection.getClass(clsName)
        let res = {
            ClassName: this.remapString(clsName),
            Object: obj,
            Fields: {},
            Methods: {}
        }
        let fields = [...cls.getFields(), ...cls.getDeclaredFields()]
        let methods = [...cls.getMethods(), ...cls.getDeclaredMethods()]

        fields.forEach(v => {
            v.setAccessible(true)
            let val
            try {
                val = v.get(obj)
            } catch {
                val = null
            }
            res.Fields[this.remapString(v.getName())] = val
        })

        methods.forEach(v => res.Methods[this.remapString(v.getName())] = function () {
            v.setAccessible(true)
            let val = arguments.length == 0 ? v.invoke(obj) : v.invoke(obj, ...arguments)
            return DeobfReflect.remapObject(val)
        })

        return res
    },
    load: () => {
        // 扩展映射方法到Object原型链中
        Object.defineProperty(Object.prototype, 'remap', {
            value: function () {
                return DeobfReflect.remapObject(this)
            },
            enumerable: false,
            writable: false,
            configurable: true,
        })
    }
}
DeobfReflect.load()

// 样例
Chat.log(DeobfReflect.getClassByYarn('net/minecraft/client/MinecraftClient')
    .Methods.getModStatus())
Chat.log(DeobfReflect.getClassByYarn('net.minecraft.client.MinecraftClient')
    .Methods.getModStatus())
Chat.log(Client.getMinecraft().remap()
    .Methods.getResourceManager()
    .Methods.streamResourcePacks().toArray())
