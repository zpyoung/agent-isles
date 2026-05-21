class DemoWidget extends HTMLElement {
  connectedCallback() {
    const title = this.getAttribute('title') || 'Demo widget';
    const tone = this.getAttribute('tone') || 'info';
    this.innerHTML = `
      <article class="demo-widget demo-widget--${tone}">
        <strong>${title}</strong>
        <p><slot></slot></p>
      </article>
    `;
  }
}

if (!customElements.get('demo-widget')) {
  customElements.define('demo-widget', DemoWidget);
}
