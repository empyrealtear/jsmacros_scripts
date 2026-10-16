// kubejs\startup_scripts\chaos_deploy.js
function mulberry32(seed) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0
        var t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function randomBool(seed) {
    const rand = mulberry32(seed)
    return rand() > 0.5 ? 0 : 1
}

function getRecipes(world_seed) {
    let seed = (world_seed / 10000 + (world_seed % 10000)).toFixed()
    // let ingredients = ["kubejs:silver_nugget", "createdeco:netherite_nugget"]
    let ingredients = ["银粒", "下界合金粒"]
    let recipes = []
    for (let step = 0; step < 6; step++) {
        let choosen = randomBool(seed + step)
        recipes.push(ingredients[choosen])
    }
    return recipes
}

console.log(getRecipes('114514').join('→'))
