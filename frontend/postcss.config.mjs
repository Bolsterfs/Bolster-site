/** PostCSS pipeline — without this file Tailwind's @tailwind/@apply rules in
 *  globals.css are never compiled and every Tailwind class renders unstyled. */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

export default config
