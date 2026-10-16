const resourceUtils = {
    // 参考：https://maven.fabricmc.net/docs/yarn-1.20.1+build.2/net/minecraft/client/MinecraftClient.html
    ResourceType: {
        CLIENT_RESOURCES: Java.type('net.minecraft.class_3264')?.field_14188,
        SERVER_DATA: Java.type('net.minecraft.class_3264')?.field_14190,
    },

    Identifier: function (path) { return Reflection.newInstance(Java.type('net.minecraft.class_2960'), path) },
    getResourceManager: function () { return Client.getMinecraft()?.method_1478() },
    getTextureManager: function () { return Client.getMinecraft()?.method_1531() },
    getResourcePackManager: function () { return Client.getMinecraft()?.method_1520() },
    getStreamResourcePacks: function () { return this.getResourceManager()?.method_29213()?.iterator() },
    getNamespaces: function (resourcePack, type) { return resourcePack?.method_14406(type)?.toArray() },
    getAllResources: function (identifier) { return this.getResourceManager()?.method_14489(identifier) },
    openResource: function (resourcePack, path, type) {
        if (type == null)
            type = this.ResourceType.CLIENT_RESOURCES
        return resourcePack?.method_14405(type, this.Identifier(path)) // open()
    },
    getZipFile: function (resourcePack) {
        let getZipFile = Reflection.getDeclaredMethod(Java.type('net.minecraft.class_3258'), 'method_14399')
        getZipFile.setAccessible(true)
        let paths = Reflection.invokeMethod(getZipFile, resourcePack)?.stream()?.toArray()
        paths = paths.filter(v => !`${v}`.endsWith('/')).sort((a, b) => `${a[0]}`.localeCompare(`${b[0]}`.toString()))
        let maps = new Map()
        paths.forEach(v => {
            let path = v?.toString()?.replace(/^\/?([^\/]+)\/([^\/]+)\/(.*)$/, '$2:$3')
            maps.set(path, this.getAllResources(this.Identifier(path)))
        })
        return maps
    },
    findResources: function (regex) {
        let resources = new Map()
        //perform vanilla search with placeholder string that will trigger a blanket resource search
        // zip resource-packs specifically do not allow empty search strings
        try {
            this.getResourceManager()?.method_41265('$search', (id) => true)?.forEach((k, v) =>
                resources.set(k.toString(), v?.toArray()))
        } catch { }
        //fabric mod resources allow direct blank searches so catch those too
        try {
            this.getResourceManager()?.method_41265('', (id) => true)?.forEach((k, v) =>
                resources.set(k.toString(), v?.toArray()))
        } catch { }

        // net.minecraft.class_380 net/minecraft/client/font/GlyphAtlasTexture https://maven.fabricmc.net/docs/yarn-1.20.1+build.2/net/minecraft/client/font/GlyphAtlasTexture.html
        // net.minecraft.class_1043 net/minecraft/client/texture/NativeImageBackedTexture https://maven.fabricmc.net/docs/yarn-1.20.1+build.2/net/minecraft/client/texture/NativeImageBackedTexture.html
        // net.minecraft.class_1049 net/minecraft/client/texture/ResourceTexture https://maven.fabricmc.net/docs/yarn-1.20.1+build.2/net/minecraft/client/texture/ResourceTexture.html
        // net.minecraft.class_1059 net/minecraft/client/texture/SpriteAtlasTexture https://maven.fabricmc.net/docs/yarn-1.20.1+build.2/net/minecraft/client/texture/SpriteAtlasTexture.html
        // resourceUtils.getTextureManager()?.getTextures()?.forEach((k, v) => resources.set(k, v))

        // zip resource-packs
        let streamResources = this.getStreamResourcePacks()
        if (streamResources == null)
            return null
        while (streamResources.hasNext()) {
            let resourcePack = streamResources.next()
            let className = Reflection.getClassName(resourcePack)
            let name = resourcePack?.method_14409()
            // let namespaces = {
            //     CLIENT_RESOURCES: this.getNamespaces(resourcePack, this.ResourceType.CLIENT_RESOURCES),
            //     SERVER_DATA: this.getNamespaces(resourcePack, this.ResourceType.SERVER_DATA),
            // }
            if (className == 'net.minecraft.class_3258') {
                // net/minecraft/resource/ZipResourcePack
                this.getZipFile(resourcePack).forEach((v, k) => {
                    if (v != null)
                        resources.set(k, v?.toArray())
                    // resources.set(k, v?.get())
                })
            } else if (className == 'net.minecraft.class_3268') {
                // net/minecraft/resource/DefaultResourcePack
                // resourcePack?.method_43032()
            } else {

            }
        }
        resources = new Map(Array.from(resources).filter(v => {
            return new RegExp(regex).test(v[0])
        }).sort((a, b) => {
            return a[0].toString().localeCompare(b[0].toString())
        }))
        return resources
    },

    parseData: function (path, data) {
        if (data == null || !('method_14482' in data))
            return null

        let inputStream = data?.method_14482()
        if (path.endsWith(".txt") ||
            path.endsWith(".properties") || path.endsWith(".toml") ||
            path.endsWith(".json") || path.endsWith(".json5")) {
            return String.fromCharCode(...inputStream?.readAllBytes())
        }
        if (path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg")) {
            return this.asNaviteImage(inputStream?.readAllBytes())
        }
        if (path.endsWith(".jem")) {
            return data
        }
        if (path.endsWith(".jpm")) {
            return data
        }
        if (path.endsWith(".ogg") || path.endsWith(".mp3")) {
            return data
        }
        if (path.endsWith(".zip")) {
            return data
        }
        return data
    },

    asNaviteImage: (bytes) => {
        let image = Java.type('net.minecraft.class_1011')?.method_49277(bytes)
        return {
            image: image,
            getBytes: function () { return this.image.method_24036() },
            getWidth: function () { return this.image.method_4307() },
            getHeight: function () { return this.image.method_4323() },
            getFormat: function () { return this.image.method_4318() },
            isRGBA: function () { return this.getFormat() == Java.type('net.minecraft.class_1011$class_1012').field_4997 },
            getChannelCount: function () { return this.image.method_4318().method_4335() },
            getColor: function (x, y) { return this.image.method_4315(x, y) },
            getPixel: function (x, y) {
                let argb = this.getColor(x, y)
                let color = {
                    R: argb & 0xFF,
                    G: (argb >> 8) & 0xFF,
                    B: (argb >> 16) & 0xFF,
                }
                return {
                    ...color,
                    hex: '#' + Object.values(color).map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()
                }
            },
            asPixelArray: function () {
                let width = this.getWidth()
                let height = this.getHeight()
                let arr = []
                for (let y = 0; y < height; y++) {
                    let line = []
                    for (let x = 0; x < width; x++) {
                        line[x] = this.getPixel(x, y)
                    }
                    arr[y] = line
                }
                return arr
            },
            toString: function () {
                return `[width: ${this.getWidth()}px, height: ${this.getHeight()}px]`
            }
        }
    },
    asString: (bytes) => {
        return String.fromCharCode(...bytes)
    }
}

function isGreenish(r, g, b) {
    return g > r && g > b && (g > 1.2 * Math.max(r, b))
}
const flog = (val) => {
    FS.open("D:/Game/Minecraft/jsmacros/typescript/jsmlogs.txt").append(val)
}
let defaultJson = null
resourceUtils.findResources(/customfishing\:.*default\.json/).forEach((v, k) => {
    flog(`${k}: ${v}\n`)
    let data = v.map(v => resourceUtils.parseData(k, v))[0]
    flog(data + '\n')
    defaultJson = JSON.parse(data)
})
let bars = {}
resourceUtils.findResources(/customfishing\:.*bar\d+/).forEach((v, k) => {
    flog(`${k}: ${v}\n`)
    let data = v.map(v => resourceUtils.parseData(k, v).asPixelArray()[3]
        .map(v => isGreenish(v.R, v.G, v.B) ? 1 : 0))[0]
    let rate = []
    for (let i = 1; i < 45; i++) {
        let p = data.slice(i * 4, (i + 1) * 4)
        rate.push(p[0])
    }
    for (let i = 0; i < 4; i++) {
        flog(rate.slice(i * 11, (i + 1) * 11).join(', ') + ',\n')
    }
    let char = defaultJson["providers"].filter(v => k.includes(v.file.split(':')[1]))[0]
    bars[char.chars[0].charCodeAt().toString(16)] = {
        ...char,
        "rate": rate,
        "width-per-section": 4, "pointer-offset": -183, "pointer-width": 5,
    }
})
flog(JSON.stringify(bars) + '\n')
