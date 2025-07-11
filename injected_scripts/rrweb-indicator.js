(() => {
  const indicator = document.createElement('div');
  indicator.id = '__rrweb-recording-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    width: 12px;
    height: 12px;
    background: #dc2626;
    border-radius: 50%;
    z-index: 999999;
    pointer-events: none;
    animation: rrwebPulse 2s infinite;
    box-shadow: 0 0 0 0 rgba(220, 38, 38, 1);
  `;
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes rrwebPulse {
      0% {
        box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7);
      }
      70% {
        box-shadow: 0 0 0 10px rgba(220, 38, 38, 0);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(220, 38, 38, 0);
      }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(indicator);
  
  window.__removeRrwebIndicator = () => {
    indicator.remove();
    style.remove();
  };
})();
