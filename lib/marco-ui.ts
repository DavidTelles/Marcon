// Only fixed intents over visible native controls. No model selectors or JavaScript.
export type MarcoUIResult = { reply: string; confirm?: () => string };
const normal = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
const visible = (element: HTMLElement) =>
  element.getClientRects().length > 0 &&
  !element.closest('[aria-hidden="true"], [inert], dialog');
const caption = (
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
) =>
  normal(
    [
      field.getAttribute("aria-label"),
      ...Array.from(field.labels || []).map((label) => label.textContent),
      field.getAttribute("placeholder"),
      field.name,
    ]
      .filter(Boolean)
      .join(" "),
  );
function fields() {
  return Array.from(
    document.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >("main input, main textarea, main select"),
  ).filter(
    (field) =>
      visible(field) &&
      !field.disabled &&
      !("readOnly" in field && field.readOnly) &&
      ![
        "hidden",
        "password",
        "file",
        "submit",
        "button",
        "radio",
        "checkbox",
      ].includes(field.type) &&
      !/senha|password|token|secret|credencial/.test(caption(field)),
  );
}
function fill(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  const maximum =
    "maxLength" in field && field.maxLength > 0 ? field.maxLength : 1000;
  if (value.length > maximum)
    return "O valor excedeu o limite deste campo. Dite um texto mais curto.";
  if (field instanceof HTMLSelectElement) {
    const options = Array.from(field.options).filter(
      (option) =>
        !option.disabled &&
        (normal(option.text) === normal(value) ||
          normal(option.value) === normal(value)),
    );
    if (options.length !== 1)
      return "A opção não é única ou não existe. Diga o nome completo mostrado na tela.";
    value = options[0].value;
  }
  const prototype =
    field instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.focus();
  return "Campo preenchido na tela. Revise antes de salvar.";
}
export function marcoUICommand(text: string): MarcoUIResult | null {
  const command = normal(text).replace(/[.!?]+$/, "");
  const entry = text.match(
    /^(?:preencha|preencher|corrija|corrigir|selecione|selecionar) (?:o campo |a opcao |a opção )?(.+?) (?:com|para|como) (.+)$/i,
  );
  const search = text.match(/^(?:pesquise|pesquisar|busque|buscar) (.+)$/i);
  if (entry || search) {
    const query = entry ? normal(entry[1]) : "";
    const candidates = fields().filter((field) =>
      entry
        ? caption(field).includes(query)
        : field.type === "search" ||
          /buscar|pesquisar|busca|pesquisa/.test(caption(field)),
    );
    if (candidates.length !== 1)
      return {
        reply: candidates.length
          ? "Há mais de um campo possível. Diga o rótulo completo do campo."
          : "Não encontrei esse campo editável nesta tela. Abra o formulário ou use a tarefa guiada do Marco.",
      };
    return {
      reply: fill(candidates[0], entry ? entry[2].trim() : search![1].trim()),
    };
  }
  if (command === "ler resultados" || command === "ler erros") {
    const selectors =
      command === "ler erros"
        ? 'main [role="alert"], main [aria-live="assertive"]'
        : 'main [role="status"], main [aria-live], main tbody tr';
    const results = Array.from(
      document.querySelectorAll<HTMLElement>(selectors),
    )
      .filter(visible)
      .map((element) => element.innerText.trim())
      .filter(Boolean)
      .slice(0, 5)
      .join(". ");
    return {
      reply:
        results.slice(0, 1200) ||
        "Não há mensagens ou resultados visíveis para ler.",
    };
  }
  if (command !== "salvar" && command !== "salvar formulario") return null;
  const forms = Array.from(
    document.querySelectorAll<HTMLFormElement>("main form"),
  ).filter(visible);
  const choices = forms.flatMap((form) =>
    Array.from(form.querySelectorAll<HTMLButtonElement>("button"))
      .filter(
        (button) =>
          visible(button) &&
          !button.disabled &&
          /^(salvar|enviar|cadastrar|criar)(\s|$)/.test(
            normal(button.innerText),
          ),
      )
      .map((button) => ({ form, button })),
  );
  if (choices.length !== 1)
    return {
      reply:
        "Abra um formulário com um único botão Salvar ou use o cadastro guiado do Marco. Este controle não pôde ser identificado com segurança.",
    };
  const { form, button } = choices[0];
  // File/password fields cannot be dictated or echoed. These workflows require their native controls.
  if (form.querySelector('input[type="password"], input[type="file"]'))
    return {
      reply:
        "Este formulário exige senha ou arquivo. Conclua essa etapa pelos controles da tela.",
    };
  const snapshot = () =>
    JSON.stringify(
      Array.from(
        form.querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >("input,textarea,select"),
      ).map((field) => [
        field.name,
        field.id,
        field.type,
        field.value,
        "checked" in field ? field.checked : null,
      ]),
    );
  const before = snapshot(),
    page = location.href,
    label = button.innerText;
  const expires = Date.now() + 10 * 60_000;
  const summary = Array.from(
    form.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >("input,textarea,select"),
  )
    .filter((field) => visible(field) && field.type !== "hidden")
    .map(
      (field) =>
        `${caption(field) || "campo"}: ${field instanceof HTMLSelectElement ? `${field.selectedOptions[0]?.text || field.value} (${field.value})` : field.value}`,
    )
    .join("; ");
  if (summary.length > 1800)
    return {
      reply:
        "O formulário é extenso para uma revisão completa por voz. Use a tarefa guiada ou revise e salve pelos controles da tela.",
    };
  let used = false;
  return {
    reply: `Revise ${label}: ${summary}. Diga confirmar formulário ou cancelar.`,
    confirm: () => {
      if (used)
        return "Este envio já foi solicitado. Consulte a mensagem da tela; não será repetido.";
      if (
        Date.now() > expires ||
        location.href !== page ||
        !form.isConnected ||
        snapshot() !== before ||
        button.disabled ||
        button.innerText !== label
      )
        return "O formulário mudou. Diga salvar novamente para revisar os novos dados.";
      used = true;
      if (!form.reportValidity())
        return "O formulário tem campos inválidos. Corrija os erros mostrados na tela.";
      button.click();
      return "Formulário enviado ao fluxo da tela. Aguarde o resultado; diga ler resultados ou ler erros. Ainda não há confirmação de gravação.";
    },
  };
}
