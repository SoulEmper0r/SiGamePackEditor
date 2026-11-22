const QUESTION_TYPES = [
  {
    value: "simple",
    label: "Обычный вопрос с кнопкой",
    description: "Все игроки могут нажать кнопку и ответить. Первый нажавший получает право ответа."
  },
  {
    value: "forAll",
    label: "Вопрос для всех (совместимость с V2)",
    description: "Старое значение типа, которое реально используется в тестовом V2. Сохраняем код forAll без автоматической замены на simple."
  },
  {
    value: "stake",
    label: "Вопрос со ставкой (аукцион)",
    description: "Игроки делают ставки; вопрос разыгрывает участник с наибольшей ставкой."
  },
  {
    value: "stakeAll",
    label: "Вопрос для всех со ставкой",
    description: "Все игроки делают скрытые ставки и отвечают на вопрос."
  },
  {
    value: "secret",
    label: "Кот в мешке",
    description: "Получивший вопрос игрок передаёт его другому игроку или оставляет себе."
  },
  {
    value: "secretPublicPrice",
    label: "Кот в мешке с открытой темой и ценой",
    description: "Тема и стоимость известны до передачи вопроса выбранному игроку."
  },
  {
    value: "secretNoQuestion",
    label: "Кот в мешке без вопроса",
    description: "Вопроса нет: выбранный игрок получает указанное количество баллов."
  },
  {
    value: "noRisk",
    label: "Вопрос без риска (старый тип)",
    description: "Совместимость со старым типом SIQ. В новых версиях игры режим без риска может настраиваться отдельно."
  }
];

const QUESTION_TYPE_BY_VALUE = new Map(QUESTION_TYPES.map(item => [item.value, item]));

export function getQuestionTypeOptions(currentValue) {
  const options = QUESTION_TYPES.map(item => ({...item}));
  const value = String(currentValue ?? "");
  if (!value) {
    options.unshift({
      value: "",
      label: "Тип не задан",
      description: "У вопроса не указан тип. Выберите подходящий вариант."
    });
  }
  if (value && !QUESTION_TYPE_BY_VALUE.has(value)) {
    options.unshift({
      value,
      label: "Неизвестный тип: " + value,
      description: "Неизвестный или пользовательский код. Он будет сохранён без изменений, пока не выбран другой тип."
    });
  }
  return options;
}

export function getQuestionTypeDescription(value) {
  const item = QUESTION_TYPE_BY_VALUE.get(String(value ?? ""));
  if (item) return item.description;
  if (value) return "Неизвестный или пользовательский код. Он сохраняется без изменений.";
  return "Выберите тип игрового вопроса.";
}
