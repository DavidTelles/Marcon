// Only fixed intents over visible native controls. No model selectors or JavaScript.
import { commandText, quantityWords } from "./james-commands";
export type MarcoUIResult = { reply: string; confirm?: () => string };
const normal = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
const visible = (element: HTMLElement) =>
  element.getClientRects().length > 0 &&
  !element.closest('[aria-hidden="true"], [inert], dialog:not([open])');
function surface(): HTMLElement | null {
  const main = document.querySelector<HTMLElement>("main");
  if (!main) return null;
  // Restrict commands to the open business dialog instead of fields behind it.
  return (
    Array.from(
      main.querySelectorAll<HTMLElement>(
        '[role="dialog"][aria-modal="true"], dialog[open]',
      ),
    )
      .filter(visible)
      .at(-1) || main
  );
}
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
    surface()?.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >("input, textarea, select") || [],
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
  if (
    field instanceof HTMLInputElement &&
    ["number", "range"].includes(field.type)
  ) {
    const numeric = quantityWords(commandText(value))
      .replace(/\s+unidades?$/, "")
      .replace(",", ".");
    if (!/^-?\d+(?:\.\d+)?$/.test(numeric) || !Number.isFinite(Number(numeric)))
      return "Informe um número válido para esse campo.";
    value = numeric;
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
  text = text
    .trim()
    .replace(/^marcos?[\s,:]+/i, "")
    .replace(/[.!?]+$/, "");
  const command = normal(text).replace(/[.!?]+$/, "");
  const entry = text.match(
    /^(?:preencha|preencher|corrija|corrigir|selecione|selecionar) (?:o campo |a opcao |a opção )?(.+?) (?:com|para|como) (.+)$/i,
  );
  const search = text.match(/^(?:pesquise|pesquisar|busque|buscar) (.+)$/i);
  const check = text.match(
    /^(marque|desmarque) (?:a opção |a opcao |o campo )?(.+)$/i,
  );
  if (check) {
    const query = normal(check[2]);
    const choices = Array.from(
      surface()?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ||
        [],
    ).filter(
      (field) =>
        visible(field) && !field.disabled && caption(field).includes(query),
    );
    if (choices.length !== 1)
      return {
        reply:
          "Não encontrei uma única opção disponível com esse rótulo. Diga o rótulo completo da opção.",
      };
    const field = choices[0],
      desired = normal(check[1]) === "marque";
    if (field.checked !== desired) field.click();
    return {
      reply: `Opção ${desired ? "marcada" : "desmarcada"} na tela. Revise antes de confirmar a operação.`,
    };
  }
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
  const click = text.match(
    /^(?:clique|clicar|aperte|pressione)(?: em| no bot[aã]o| o bot[aã]o)?\s+(.+)$/i,
  );
  if (click) {
    const record = normal(click[1]).match(
      /\s+(?:do|da|no|na)\s+(recebimento|requisicao|consumivel|registro)\s+#?(\d+)$/,
    );
    const query = normal(record ? click[1].slice(0, record.index) : click[1]);
    const buttons = Array.from(
      surface()?.querySelectorAll<HTMLButtonElement>("button") || [],
    ).filter(
      (button) =>
        visible(button) &&
        !button.disabled &&
        normal(button.getAttribute("aria-label") || button.innerText) ===
          query &&
        (!record ||
          (button.closest<HTMLElement>("[data-marco-record-id]")?.dataset
            .marcoRecordId === record[2] &&
            (record[1] === "registro" ||
              button.closest<HTMLElement>("[data-marco-record-kind]")?.dataset
                .marcoRecordKind === record[1]))),
    );
    if (buttons.length !== 1)
      return {
        reply: buttons.length
          ? "Há mais de um botão com esse nome. Abra o registro ou formulário correto antes de continuar."
          : "Não encontrei um botão disponível com esse nome. Diga o nome completo mostrado na tela.",
      };
    const button = buttons[0],
      form = button.closest("form");
    if (form?.querySelector('input[type="password"], input[type="file"]'))
      return {
        reply:
          "Este formulário exige senha ou arquivo. Conclua essa etapa pelos controles da tela.",
      };
    const scope =
      button.closest<HTMLElement>('article, [role="dialog"], dialog') ||
      form ||
      button.closest<HTMLElement>("section") ||
      surface()!;
    const snapshot = () =>
      JSON.stringify({
        text: scope.innerText,
        fields: Array.from(
          scope.querySelectorAll<
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          >("input,select,textarea"),
        ).map((field) => [
          field.name,
          field.value,
          "checked" in field ? field.checked : null,
        ]),
      });
    const before = snapshot(),
      page = location.href,
      expires = Date.now() + 10 * 60_000;
    const values = Array.from(
      scope.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input,select,textarea"),
    )
      .filter(
        (field) =>
          visible(field) &&
          field.type !== "hidden" &&
          field.type !== "password" &&
          field.type !== "file",
      )
      .map(
        (field) =>
          `${caption(field) || "campo"}: ${field instanceof HTMLSelectElement ? field.selectedOptions[0]?.text || field.value : field instanceof HTMLInputElement && field.type === "checkbox" ? (field.checked ? "marcada" : "desmarcada") : field.value}`,
      )
      .join("; ");
    const summary = `${scope.innerText.trim()}${values ? `; ${values}` : ""}`;
    if (
      summary.length > 1800 ||
      scope.querySelector('input[type="password"], input[type="file"]')
    )
      return {
        reply:
          "Abra o registro ou formulário específico para revisar esta ação por voz.",
      };
    let used = false;
    return {
      reply: `Revise o botão ${button.innerText}: ${summary}. Diga confirmar formulário ou cancelar.`,
      confirm: () => {
        if (used)
          return "Este comando já foi enviado à tela; não será repetido.";
        if (
          Date.now() > expires ||
          location.href !== page ||
          !button.isConnected ||
          !visible(button) ||
          button.disabled ||
          snapshot() !== before
        )
          return "A tela mudou. Peça o botão novamente para revisar a ação atual.";
        if (form && !form.reportValidity())
          return "O formulário tem campos inválidos. Corrija os erros mostrados na tela.";
        used = true;
        button.click();
        return "Botão acionado na tela. Aguarde o resultado; diga ler resultados ou ler erros para consultar a resposta do sistema.";
      },
    };
  }
  if (command !== "salvar" && command !== "salvar formulario") return null;
  const forms = Array.from(
    surface()?.querySelectorAll<HTMLFormElement>("form") || [],
  ).filter(visible);
  const choices = forms.flatMap((form) =>
    Array.from(form.querySelectorAll<HTMLButtonElement>("button"))
      .filter(
        (button) =>
          visible(button) &&
          !button.disabled &&
          /^(salvar|enviar|cadastrar|criar|confirmar opera[cç][aã]o)(\s|$)/.test(
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
  const context =
    form.closest<HTMLElement>('article, [role="dialog"], dialog') || form;
  // File/password fields cannot be dictated or echoed. These workflows require their native controls.
  if (form.querySelector('input[type="password"], input[type="file"]'))
    return {
      reply:
        "Este formulário exige senha ou arquivo. Conclua essa etapa pelos controles da tela.",
    };
  const snapshot = () =>
    JSON.stringify({
      context: context.innerText,
      fields: Array.from(
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
    });
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
        `${caption(field) || "campo"}: ${field instanceof HTMLSelectElement ? `${field.selectedOptions[0]?.text || field.value} (${field.value})` : field instanceof HTMLInputElement && field.type === "checkbox" ? (field.checked ? "marcada" : "desmarcada") : field.value}`,
    )
    .join("; ");
  if (summary.length > 1800)
    return {
      reply:
        "O formulário é extenso para uma revisão completa por voz. Use a tarefa guiada ou revise e salve pelos controles da tela.",
    };
  let used = false;
  return {
    reply: `Revise ${context !== form ? context.innerText.trim() + ": " : ""}${label}: ${summary}. Diga confirmar formulário ou cancelar.`,
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
