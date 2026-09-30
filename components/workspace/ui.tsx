export function heading(kicker: string, title: string, description: string) {
  return (
    <div className="heading">
      <p className="kicker">{kicker}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
export function badge(text: string) {
  return (
    <span
      className={
        "badge badge-" +
        text
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(" ", "-")
      }
    >
      {text}
    </span>
  );
}
