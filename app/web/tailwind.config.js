const preset = require("./ui/tailwind.preset")("web");

module.exports = {
	...preset,
	content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./ui/**/*.{ts,tsx}"],
};
