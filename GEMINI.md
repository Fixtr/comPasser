# **AI Development Guidelines for Modern Web Projects in Firebase Studio**

These guidelines define the operational principles and capabilities of an AI agent (e.g., Gemini) interacting with framework-less web projects (HTML, CSS, JavaScript) within the Firebase Studio environment. The goal is to enable an efficient, automated, and error-resilient application design and development workflow that leverages modern, widely supported web standards (Baseline).

## **Environment & Context Awareness**

The AI operates within the Firebase Studio development environment, which provides a Code OSS-based IDE and a simple, pre-configured environment for web development.

* **Project Structure:** The AI assumes a basic web project structure. The primary entry point is `index.html`. CSS and JavaScript are expected to be in files like `style.css` and `main.js`, linked from the HTML.
* **`dev.nix` Configuration:** The AI is aware of the `.idx/dev.nix` file for environment configuration, which may include tools like `pkgs.nodejs` for development servers or build tools.
* **Preview Server:** Firebase Studio provides a running preview server. The AI will monitor the server's output (e.g., console logs, network requests) for real-time feedback on changes.
* **Firebase Integration:** The AI recognizes standard Firebase integration patterns, such as including the Firebase SDKs from the CDN and initializing the app with a configuration object.

## **Code Modification & Dependency Management**

The AI is empowered to modify the codebase autonomously based on user requests.  The AI is creative and anticipates features that the user might need even if not explicitly requested.

* **Core Code Assumption:** The AI will primarily modify `.html`, `.css`, and `.js` files. It will create new files as needed and ensure they are correctly linked in `index.html`.
* **Dependency Management:** For a framework-less project, the AI will prefer to use ES Modules for JavaScript, importing/exporting functionality between files. For third-party libraries, it will use CDN links with Subresource Integrity (SRI) hashes for security, or install them via npm if a `package.json` is present.

## **Modern HTML: Web Components**

The AI will use Web Components to create encapsulated, reusable UI elements without external frameworks.

* **Custom Elements:** Define new HTML tags with custom behavior using JavaScript classes.
* **Shadow DOM:** Encapsulate a component's HTML structure, styling, and behavior, preventing conflicts with the main document.
* **HTML Templates (`<template>` and `<slot>`):** Create inert chunks of markup to be cloned and used in custom elements, with slots for flexible content injection.

*Example of a simple Web Component:*

```javascript
// in main.js
class SimpleGreeting extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    const wrapper = document.createElement('span');
    wrapper.setAttribute('class', 'wrapper');
    const text = document.createElement('p');
    text.textContent = `Hello, ${this.getAttribute('name') || 'World'}!`;
    const style = document.createElement('style');
    style.textContent = `
      .wrapper {
        padding: 15px;
        border: 1px solid var(--cp-rule, #D6D6D1);
        border-radius: 0;
        background: var(--cp-surface, #FFFFFF);
        color: var(--cp-ink, #141414);
      }
    `;
    shadow.appendChild(style);
    shadow.appendChild(wrapper);
    wrapper.appendChild(text);
  }
}
customElements.define('simple-greeting', SimpleGreeting);

// in index.html
// <simple-greeting name="User"></simple-greeting>
```

## **Modern CSS (Baseline Features & Design Contracts)**

The AI will use modern, widely supported CSS features strictly aligned with ComPasser's design contracts (`src/styles/tokens.css`).

* **Container Queries (`@container`):** Create components that respond to the size of their parent container, not just the viewport.
* **Cascade Layers (`@layer`):** Manage the CSS cascade with explicit layers to prevent style conflicts, especially when integrating third-party styles.
* **The `:has()` Selector:** Select parent elements based on their children, simplifying complex styling scenarios without JavaScript.
* **Logical Properties:** Use properties like `margin-inline-start` instead of `margin-left` for better support in different writing modes.
* **Design Tokens (`--cp-*`):** Use custom properties defined in `src/styles/tokens.css` with solid hex values (e.g., `--cp-paper: #F4F4F1; --cp-ink: #141414; --cp-surface: #FFFFFF; --cp-rule: #D6D6D1;`).
* **Strict Color Constraints (No `oklch` / `color-mix` / `rgba`):** Modern wide-gamut functions (`oklch`, `lch`, `color-mix`) and arbitrary `rgba` are strictly prohibited because they break `html2canvas` DOM captures and violate style contracts (`test/frame-style-contract.test.mjs`).
* **Monochrome UI with Functional Accents:** The UI itself is strictly monochrome. Accent colors are reserved strictly for map markers and their corresponding timeline items (`--cp-anchor` #7c3aed, `--cp-start` #10b981, `--cp-stop` #3b82f6) and status badges.

## **Modern JavaScript (Baseline Features)**

The AI will write clean, efficient, and modern JavaScript.

* **ES Modules:** Use `import` and `export` to organize code into reusable modules.
* **Async/Await:** Handle asynchronous operations (like `fetch`) with clean, readable syntax.
* **The `fetch` API:** Make network requests to APIs.
* **Promises:** Work with asynchronous results in a structured way.
* **Modern Syntax:** Utilize arrow functions, destructuring, spread/rest operators, and optional chaining (`?.`).

## **Advanced Capabilities**

### **3D Graphics with Three.js**

When 3D graphics are requested, the AI will use the **Three.js** library.

* **Setup:** The AI will add Three.js to the project, typically via a CDN or by installing the `three` package from npm.
* **Core Concepts:** The AI will create a `Scene`, a `Camera`, and a `WebGLRenderer`. It will add `Meshes` (geometry \+ material) to the scene and render the result.
* **Performance:** For complex scenes, the AI will employ optimization techniques like reducing draw calls, using Level of Detail (LOD), and optimizing 3D assets.
* **Shaders:** For custom visual effects, the AI can write and implement GLSL shaders using `ShaderMaterial`.

### **High-Performance with WebAssembly (WASM)**

For computationally intensive tasks, the AI can integrate WebAssembly modules.

* **Use Cases:** Ideal for tasks like in-browser image/video processing, scientific simulations, or games.
* **Integration:** The AI will load and instantiate the `.wasm` file using the `WebAssembly` JavaScript API and call its exported functions. It will manage the data transfer between JavaScript and WASM efficiently.

## **Automated Error Detection & Remediation**

A critical function of the AI is to continuously monitor for and automatically resolve errors to maintain a runnable and correct application state.

* **Post-Modification Checks:** After every code modification, the AI will:
  1. Monitor the IDE's diagnostics (problem pane) for errors.
  2. Check the browser preview's developer console for runtime errors, 404s, and rendering issues.
* **Automatic Error Correction:** The AI will attempt to automatically fix detected errors. This includes, but is not limited to:
  * Syntax errors in HTML, CSS, or JavaScript.
  * Incorrect file paths in `<script>`, `<link>`, or `<img>` tags.
  * Common JavaScript runtime errors.
* **Problem Reporting:** If an error cannot be automatically resolved, the AI will clearly report the specific error message, its location, and a concise explanation with a suggested manual intervention or alternative approach to the user.

## **Visual Design & Contracts**

**Aesthetics:** The AI strictly enforces ComPasser's flat, monochrome design contracts (`tokens.css` and `test/frame-style-contract.test.mjs`). Clean spacing, sharp lines, zero shadows, high outdoor legibility, and zero capture errors.

1. Build clean, minimal, and intuitive user interfaces that follow ComPasser's `--cp-*` design tokens.
2. Ensure the app is mobile responsive and adapts to different screen sizes, working seamlessly across web and Capacitor mobile shells.
3. Propose clean typography, 1px solid borders, high-contrast layouts, and functional iconography.
4. Prohibit `box-shadow` and `gradient`: all elevation and separation is achieved through `1px solid var(--cp-rule)` borders or distinct background surfaces (`--cp-paper`, `--cp-surface`, `--cp-sunken`).
5. Border radius is strictly `0` (or `9999px` for pill badges/buttons). Avoid arbitrary `8px`, `12px`, or rounded card aesthetics.
6. If images are needed, make them relevant and meaningful, with appropriate size, layout, and licensing.
7. If there are multiple pages for the user to interact with, provide an intuitive navigation bar or controls.

**Bold Definition & Interactivity:** The AI designs high-performance, accessible UI elements.

1. Fonts - Choose clean, legible typography with clear hierarchy (hero, section headlines, badges, body).
2. Color - Strictly monochrome foundation (`--cp-ink`, `--cp-paper`, `--cp-surface`) with functional marker accents only (`--cp-anchor`, `--cp-start`, `--cp-stop`). No decorative gradients or saturated cards.
3. Texture & Background - Solid paper tone (`--cp-paper: #F4F4F1;`) without artificial noise, skeuomorphism, or gradients.
4. Visual effects - Zero drop shadows (`box-shadow: none`). Zero gradient text (`background-clip: text` prohibited).
5. Iconography - Incorporate standard monochrome icons or functional emoji to enhance quick scanning.
6. Interactivity - Buttons and interactive chips use high-contrast ink reversal on hover/active (`background: var(--cp-ink); color: var(--cp-surface);`) instead of translateY vertical lifts or glowing shadow effects.

## **Accessibility or A11Y Standards:** The AI implements accessibility features to empower all users, assuming a wide variety of users with different physical abilities, mental abilities, age groups, education levels, and learning styles.

## **Iterative Development & User Interaction**

The AI's workflow is iterative, transparent, and responsive to user input.

* **Plan Generation & Blueprint Management:** Each time the user requests a change, the AI will first generate a clear plan overview and a list of actionable steps. This plan will then be used to **create or update a blueprint.md file** in the project's root directory.
  * The `blueprint.md` file will serve as a single source of truth, containing:
    * A section with a concise overview of the purpose and capabilities.
    * A section with a detailed outline documenting the project, including *all style, design, and features* implemented in the application from the initial version to the current version.
    * A section with a detailed section outlining the plan and steps for the *current* requested change.
    *
  * Before initiating any new change, the AI will reference the `blueprint.md` to ensure full context and understanding of the application's current state.
* **Prompt Understanding:** The AI will interpret user prompts to understand the desired changes. It will ask clarifying questions if the prompt is ambiguous.
* **Contextual Responses:** The AI will provide conversational responses, explaining its actions, progress, and any issues encountered. It will summarize changes made.
* **Error Checking Flow:**
  1. **Code Change:** AI applies a code modification.
  2. **Dependency Check:** If a `package.json` was modified, AI runs `npm install`.
  3. **Preview Check:** AI observes the browser preview and developer console for visual and runtime errors.
  4. **Remediation/Report:** If errors are found, AI attempts automatic fixes. If unsuccessful, it reports details to the user.


# Firebase MCP

When requested for Firebase add the following the server configurations to .idx/mcp.json. Just add the following and don't add anything else.

{
    "mcpServers": {
        "firebase": {
            "command": "npx",
            "args": [
                "-y",
                "firebase-tools@latest",
                "experimental:mcp"
            ]
        }
    }
}