// Template function using ES6 template literals for captcha.js
const generateCaptchaJs = (
  siteKey: string,
  workerUrl: string,
  containerId: string,
  onSuccessCallback: string
): string => `
function initCaptcha(options) {
  var defaults = {
    siteKey: '${siteKey}',
    workerUrl: '${workerUrl}',
    containerId: '${containerId}',
    onSuccessCallback: ${onSuccessCallback}
  };
  var params = Object.assign({}, defaults, options || {});
  if (!document.querySelector('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]')) {
    var script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }
  var container = document.getElementById(params.containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = params.containerId;
    document.body.appendChild(container);
  }
  container.innerHTML = \`
    <h1>Verify You Are Human</h1>
    <form id="captcha-form-\${params.containerId}">
      <div class="cf-turnstile" data-sitekey="\${params.siteKey}" data-callback="onCaptchaSuccess_\${params.containerId}"></div>
      <button type="submit" disabled>Submit</button>
    </form>
    <div id="result-\${params.containerId}"></div>
  \`;
  window['onCaptchaSuccess_' + params.containerId] = function(token) {
    var submitButton = container.querySelector('button');
    submitButton.disabled = false;
    params.onSuccessCallback(token);
    var form = container.querySelector('#captcha-form-' + params.containerId);
    form.onsubmit = async function(e) {
      e.preventDefault();
      try {
        var response = await fetch(params.workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token })
        });
        var result = await response.text();
        container.querySelector('#result-' + params.containerId).textContent = result;
      } catch (error) {
        container.querySelector('#result-' + params.containerId).textContent = 'Error: ' + error.message;
      }
    };
  };
}
window.initCaptcha = initCaptcha;
`;

const usageHtml = (siteKey: string): string => `
  <script src="captcha.js?siteKey=${siteKey}&containerId=captcha-example&onSuccessCallback=function(token){console.log('Token:',token);}"></script>
  <script>
    initCaptcha();
  </script>
`;

// Example HTML page
const generateExampleHtml = (siteKey: string): string => `
<!DOCTYPE html>
<html>
<head>
  <title>CAPTCHA Example</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
    #captcha-example { max-width: 400px; margin: 0 auto; }
  </style>
</head>
<body>
  <h1>CAPTCHA Example</h1>
  <p>This is an example of how to use the CAPTCHA script served by this Worker.</p>
  <div id="captcha-example"></div>
  <script src="captcha.js?siteKey=${siteKey}&containerId=captcha-example&onSuccessCallback=function(token){console.log('Token:',token);}"></script>
  <script>
    initCaptcha();
  </script>
  <p>After verification, check the browser console for the token, or submit the form to see the result.</p>
  <div id="code" style="white-space: wrap; text-align: left; border: 1px solid black; padding: 10px; font-size: 10pt">
  </div>
</body>
</html>
`;

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    const SITE_KEY = env.SITE_KEY;
    const SECRET = env.SECRET;
    const WORKER_URL = url.origin;

    if (path === '/captcha.js') {
      const params = {
        siteKey: url.searchParams.get('siteKey') || SITE_KEY,
        workerUrl: url.searchParams.get('workerUrl') || `${WORKER_URL}/verify`,
        containerId: url.searchParams.get('containerId') || 'captcha-container',
        onSuccessCallback: url.searchParams.get('onSuccessCallback') || 'function(token) { console.log("Token:", token); }'
      };

      const renderedJs = generateCaptchaJs(
        params.siteKey,
        params.workerUrl,
        params.containerId,
        params.onSuccessCallback
      );

      return new Response(renderedJs, {
        headers: {
          'Content-Type': 'application/javascript',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    if (path === '/verify' && request.method === 'POST') {
      try {
        const body = await request.json<{ token: string }>();
        const token = body.token;

        if (!token) {
          return new Response("Token required", {
            status: 400,
            headers: { 'Content-Type': 'text/plain' }
          });
        }

        const validationResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `secret=${SECRET}&response=${token}`
        });
        const validationResult = await validationResponse.json<{ success: boolean }>();

        return new Response(validationResult.success ? "Verification successful!" : "Verification failed", {
          status: validationResult.success ? 200 : 403,
          headers: { 'Content-Type': 'text/plain' }
        });
      } catch (error) {
        return new Response(`Error: ${(error as Error).message}`, {
          status: 500,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    }

    if (path === '/example') {
      const exampleHtml = generateExampleHtml(SITE_KEY) +
        `
        <script>
          document.addEventListener("DOMContentLoaded", () => {
            document.querySelector("#code").innerText = decodeURI("${encodeURI(usageHtml('<SITE-KEY>'))}");
          });
        </script>`

      return new Response(exampleHtml, {
        headers: {
          'Content-Type': 'text/html',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    return new Response("Use /captcha.js, /verify, or /example", {
      status: 404,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
};
