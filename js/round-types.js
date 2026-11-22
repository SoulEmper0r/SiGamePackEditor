const ROUND_TYPES = [
  {
    value: "final",
    label: "Финальный раунд",
    description: "Финальный раунд пакета. Сохраняется в XML как type=\"final\"."
  }
];

const ROUND_TYPE_BY_VALUE = new Map(ROUND_TYPES.map(item => [item.value, item]));

export function getRoundTypeOptions(currentValue) {
  const options = ROUND_TYPES.map(item => ({...item}));
  const value = String(currentValue ?? "");
  if (!value) {
    options.unshift({
      value: "",
      label: "Обычный раунд (тип не задан)",
      description: "У обычного раунда атрибут type может отсутствовать в SIQ."
    });
  }
  if (value && !ROUND_TYPE_BY_VALUE.has(value)) {
    options.unshift({
      value,
      label: "Неизвестный тип: " + value,
      description: "Пользовательское или неизвестное значение. Оно сохраняется без изменений, пока не выбран другой тип."
    });
  }
  return options;
}

export function getRoundTypeDescription(value) {
  const item = ROUND_TYPE_BY_VALUE.get(String(value ?? ""));
  if (item) return item.description;
  if (value) return "Неизвестное или пользовательское значение. Оно сохраняется без изменений.";
  return "Обычный раунд: атрибут type в XML не требуется.";
}
