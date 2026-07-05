export default [
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        sessionStorage: "readonly",
        localStorage: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        navigator: "readonly",
        location: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        Event: "readonly",
        URL: "readonly",
        Blob: "readonly",
        FileReader: "readonly",
        Image: "readonly",
        FormData: "readonly"
      }
    },
    rules: {
      "no-undef": "error"
    }
  }
];
