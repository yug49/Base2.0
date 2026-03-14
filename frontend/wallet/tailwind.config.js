/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                shadow: {
                    50: "#f0f4ff",
                    100: "#e0e9ff",
                    200: "#c2d4ff",
                    300: "#93b4ff",
                    400: "#6090ff",
                    500: "#3366ff",
                    600: "#1a44f5",
                    700: "#1430d6",
                    800: "#1228ae",
                    900: "#152689",
                },
                private: {
                    50: "#fdf4ff",
                    100: "#f9e8ff",
                    200: "#f3cffe",
                    300: "#e9a3fd",
                    400: "#d966fc",
                    500: "#c23df5",
                    600: "#ab22db",
                    700: "#9119b8",
                    800: "#771896",
                    900: "#61197a",
                },
            },
        },
    },
    plugins: [],
};
