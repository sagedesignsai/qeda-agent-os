import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['selector', '.dark'],
  content: [
    'src/**/*.{html,ts,tsx}',
  ],
  plugins: [animate],
};

export default config;
