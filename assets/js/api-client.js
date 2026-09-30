export function createApiClient(getCsrfToken) {
  return async function request(action, body = null, query = "") {
    const response = await fetch(`api.php?action=${action}${query}`, {
      method: body ? "POST" : "GET",
      headers: body
        ? {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrfToken(),
          }
        : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("O servidor não respondeu corretamente. Tente novamente.");
    }

    if (!response.ok) {
      throw new Error(payload.error || "Não foi possível concluir.");
    }
    return payload;
  };
}
