console.clear();

const elDiamondSlider = document.querySelector(".diamond-slider");
const elSlider = document.querySelector("#slider");
const elOutput = document.querySelector("#output");
const elDiamondQuantity = document.querySelector(".slider-diamond-inner");
const elQuantity = document.querySelector(".quantity");

const lerp = (curr, next) => {
    const delta = next - curr;
    if (Math.abs(delta) < 0.01) return next;
    return curr + (next - curr) * 0.13;
};

function createLerper() {
    let target = 0;
    let current = 0;
    let af;
    const observers = new Set();

    function animate() {
        current = lerp(current, target);

        observers.forEach((observer) => observer({ current, target }));

        if (current === target) return;

        af = requestAnimationFrame(animate);
    }

    return {
        update: (value) => {
            cancelAnimationFrame(af);
            target = +value;
            animate();
        },
        subscribe: (fn) => {
            observers.add(fn);

            fn({ current, target });
        }
    };
}

const lerper = createLerper();

formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
});

const min = elSlider.getAttribute("min");
const max = elSlider.getAttribute("max");

lerper.subscribe(({ current, target }) => {
    console.log("smooth", current);
    const d = current / (min + max);
    const tilt = Math.min(6, target - current);
    elDiamondSlider.style.setProperty("--d", d);
    elDiamondSlider.style.setProperty("--value", current);
    elDiamondSlider.style.setProperty("--tilt", tilt);
    elOutput.innerHTML = formatter.format(current * 35);
});

function update(value) {
    lerper.update(value);
    elDiamondQuantity.dataset.value = value;
    elQuantity.innerHTML = `Quantity: ${value}`;
}

elSlider.addEventListener("input", (e) => {
    update(e.target.value);
});

update(0);
