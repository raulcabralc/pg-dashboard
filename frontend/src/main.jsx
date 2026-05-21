import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Moon,
  Pencil,
  Play,
  Plus,
  Rows3,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import brandIconUrl from "./pg-dashboard-icon.png";
import "./styles.css";

const numberTypes = new Set([
  "bigint",
  "integer",
  "numeric",
  "real",
  "smallint",
  "double precision",
]);
const textTypes = new Set(["character", "character varying", "text", "uuid"]);
const dateTypes = new Set([
  "date",
  "time without time zone",
  "time with time zone",
  "timestamp without time zone",
  "timestamp with time zone",
]);

const functionInputNumberTypes = new Set([
  "bigint",
  "double precision",
  "integer",
  "numeric",
  "real",
  "smallint",
]);

const functionInputTextTypes = new Set([
  "character",
  "character varying",
  "text",
  "uuid",
]);

const compactDataTypes = new Map([
  ["bigint", "bigint"],
  ["boolean", "bool"],
  ["character", "char"],
  ["character varying", "varchar"],
  ["date", "date"],
  ["double precision", "dbl"],
  ["integer", "int"],
  ["json", "json"],
  ["jsonb", "jsonb"],
  ["numeric", "num"],
  ["real", "real"],
  ["smallint", "small"],
  ["text", "text"],
  ["time without time zone", "time"],
  ["time with time zone", "timetz"],
  ["timestamp without time zone", "tmstp"],
  ["timestamp with time zone", "tstz"],
  ["uuid", "uuid"],
]);

function formatDataType(dataType) {
  return compactDataTypes.get(dataType) || dataType.split(" ")[0] || dataType;
}

function shouldSelectColumnByDefault(columnName) {
  const normalizedColumnName = columnName.toLowerCase().replace(/[_\s-]/g, "");
  const auditColumnNames = new Set([
    "atualizado",
    "created",
    "createdat",
    "criado",
    "datacriacao",
    "dataatualizacao",
    "updated",
    "updatedat",
  ]);
  const auditColumnPrefixes = ["atualizado", "created", "criado", "updated"];

  return (
    !auditColumnNames.has(normalizedColumnName) &&
    !auditColumnPrefixes.some((prefix) =>
      normalizedColumnName.startsWith(prefix),
    )
  );
}

function toCsv(rows) {
  if (!rows.length) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const escapeValue = (value) => {
    if (value === null || value === undefined) {
      return "";
    }

    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeValue(row[header])).join(","),
    ),
  ].join("\n");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toExcelHtml(rows) {
  if (!rows.length) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const headCells = headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("");
  const bodyRows = rows
    .map((row) => {
      const cells = headers
        .map((header) => {
          const value = row[header];

          return `<td>${value === null || value === undefined ? "" : escapeHtml(value)}</td>`;
        })
        .join("");

      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <html>
      <head>
        <meta charset="UTF-8" />
      </head>
      <body>
        <table>
          <thead><tr>${headCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </body>
    </html>
  `;
}

function downloadBlob(content, fileName, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(rows, fileName) {
  downloadBlob(toCsv(rows), fileName, "text/csv;charset=utf-8");
}

function downloadExcel(rows, fileName) {
  downloadBlob(
    toExcelHtml(rows),
    fileName,
    "application/vnd.ms-excel;charset=utf-8",
  );
}

async function parseApiResponse(response, fallbackMessage) {
  const responseText = await response.text();
  let payload = {};

  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch (error) {
      throw new Error(
        responseText.trim().startsWith("<")
          ? "The API returned HTML instead of JSON. Restart the server so the backend routes are up to date."
          : "The API returned an invalid JSON response.",
      );
    }
  }

  if (!response.ok) {
    throw new Error(payload.error?.message || fallbackMessage);
  }

  return payload;
}

const operatorOptions = [
  { value: "equals", label: "Equals" },
  { value: "contains", label: "Contains" },
  { value: "startsWith", label: "Starts with" },
  { value: "endsWith", label: "Ends with" },
  { value: "greaterThan", label: "Greater than" },
  { value: "lessThan", label: "Less than" },
  { value: "isNull", label: "Is null" },
  { value: "isNotNull", label: "Is not null" },
];

const allowedOperatorsByKind = {
  basic: ["equals", "notEquals", "isNull", "isNotNull"],
  boolean: ["equals", "notEquals", "isNull", "isNotNull"],
  date: [
    "equals",
    "notEquals",
    "greaterThan",
    "lessThan",
    "isNull",
    "isNotNull",
  ],
  number: [
    "equals",
    "notEquals",
    "greaterThan",
    "lessThan",
    "isNull",
    "isNotNull",
  ],
  text: [
    "equals",
    "notEquals",
    "contains",
    "startsWith",
    "endsWith",
    "isNull",
    "isNotNull",
  ],
};

function getColumnKind(dataType) {
  if (numberTypes.has(dataType)) {
    return "number";
  }

  if (dateTypes.has(dataType)) {
    return "date";
  }

  if (dataType === "boolean") {
    return "boolean";
  }

  if (textTypes.has(dataType)) {
    return "text";
  }

  return "basic";
}

function getOperatorOptionsForDataType(dataType) {
  const kind = getColumnKind(dataType);
  const allowedOperators = allowedOperatorsByKind[kind];

  return operatorOptions.filter((option) =>
    allowedOperators.includes(option.value),
  );
}

function sanitizeFilterValue(value, dataType) {
  const kind = getColumnKind(dataType);

  if (kind === "number") {
    return value
      .replace(/[^\d.-]/g, "")
      .replace(/(?!^)-/g, "")
      .replace(/(\..*)\./g, "$1");
  }

  if (kind === "boolean") {
    return value
      .replace(/[^a-z]/gi, "")
      .slice(0, 5)
      .toLowerCase();
  }

  return value;
}

function getInputTypeForDataType(dataType) {
  const kind = getColumnKind(dataType);

  if (kind === "number") {
    return "text";
  }

  if (dataType === "date") {
    return "date";
  }

  if (dataType?.startsWith("timestamp")) {
    return "datetime-local";
  }

  if (dataType?.startsWith("time")) {
    return "time";
  }

  return "text";
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function formatDateInputValue(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
}

function formatTimeInputValue(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string" && /^\d{2}:\d{2}/.test(value)) {
    return value.slice(0, 8);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ].join(":");
}

function formatDateTimeInputValue(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    const normalizedValue = value.replace(" ", "T");
    const match = normalizedValue.match(
      /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?/,
    );

    if (match) {
      const [, datePart, timePart] = match;
      const [year, month, day] = datePart.split("-");

      return `${day}/${month}/${year}T${timePart}`;
    }
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const isoDate = formatDateInputValue(date);
  const [year, month, day] = isoDate.split("-");

  return `${day}/${month}/${year}T${[
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
  ].join(":")}`;
}

function formatCrudInputValue(value, column) {
  if (value === null || value === undefined) {
    return "";
  }

  if (column.dataType === "date") {
    return formatDateInputValue(value);
  }

  if (column.dataType?.startsWith("timestamp")) {
    return formatDateTimeInputValue(value);
  }

  if (column.dataType?.startsWith("time")) {
    return formatTimeInputValue(value);
  }

  return value;
}

function splitDateTimeInputValue(value) {
  const [datePart = "", timePart = ""] = String(value || "").split("T");

  return {
    date: formatMaskedDateInput(datePart),
    time: formatMaskedTimeInput(timePart),
  };
}

function mergeDateTimeInputValue(currentValue, partName, nextPartValue) {
  const currentParts = splitDateTimeInputValue(currentValue);
  const nextParts = {
    ...currentParts,
    [partName]: nextPartValue,
  };

  if (!nextParts.date && !nextParts.time) {
    return "";
  }

  return `${nextParts.date || ""}T${nextParts.time || ""}`;
}

function formatMaskedDateInput(value) {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  return [day, month, year].filter(Boolean).join("/");
}

function formatMaskedTimeInput(value) {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 4);
  let hour = digits.slice(0, 2);
  let minute = digits.slice(2, 4);

  if (hour.length === 2 && Number(hour) > 23) {
    hour = "23";
  }

  if (minute.length === 2 && Number(minute) > 59) {
    minute = "59";
  }

  return [hour, minute].filter(Boolean).join(":");
}

function dateMaskToIsoDate(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length !== 8) {
    return "";
  }

  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  return `${year}-${month}-${day}`;
}

function timestampMaskToIsoValue(value) {
  const { date, time } = splitDateTimeInputValue(value);
  const isoDate = dateMaskToIsoDate(date);

  if (!isoDate || time.length !== 5) {
    return value;
  }

  return `${isoDate}T${time}`;
}

function normalizeCrudValue(value, column, mode) {
  if (value === "" && column.isNullable) {
    return null;
  }

  if (value === "" && mode === "create" && column.hasDefault) {
    return undefined;
  }

  if (value === "" && column.isEnum && column.hasDefault) {
    return undefined;
  }

  if (column.dataType?.startsWith("timestamp")) {
    return timestampMaskToIsoValue(value);
  }

  return value;
}

function CustomDropdown({
  ariaLabel,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  return (
    <div className="customSelect" ref={rootRef}>
      <button
        type="button"
        className="customSelectTrigger"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((currentIsOpen) => !currentIsOpen)}
      >
        <span className="customSelectLabel">
          <span>{selectedOption?.label || placeholder}</span>
          {selectedOption?.isView ? (
            <span className="viewBadge">
              <Eye size={12} />
              VIEW
            </span>
          ) : null}
        </span>
        <ChevronDown className={isOpen ? "chevronOpen" : ""} size={16} />
      </button>

      {isOpen ? (
        <div className="customSelectMenu">
          {options.map((option) => (
            <button
              type="button"
              className="customSelectOption"
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              <span className="customSelectLabel">
                <span>{option.label}</span>
                {option.isView ? (
                  <span className="viewBadge">
                    <Eye size={12} />
                    VIEW
                  </span>
                ) : null}
              </span>
              {option.value === value ? <Check size={15} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ExportMenu({ disabled, onExportCsv, onExportExcel }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  function runExport(callback) {
    callback();
    setIsOpen(false);
  }

  return (
    <div className="exportMenu" ref={rootRef}>
      <button
        type="button"
        className="buttonWithIcon exportTrigger"
        aria-label="Export rows"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((currentIsOpen) => !currentIsOpen)}
      >
        <Download size={16} />
        Export
        <ChevronDown className={isOpen ? "chevronOpen" : ""} size={15} />
      </button>

      {isOpen ? (
        <div className="exportMenuList">
          <button
            type="button"
            className="exportMenuItem"
            onClick={() => runExport(onExportCsv)}
          >
            <FileText size={15} />
            CSV
          </button>
          <button
            type="button"
            className="exportMenuItem"
            onClick={() => runExport(onExportExcel)}
          >
            <FileSpreadsheet size={15} />
            Excel
          </button>
        </div>
      ) : null}
    </div>
  );
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

function App() {
  const [themeName, setThemeName] = useState(() => {
    return localStorage.getItem("pgDashboardTheme") || "light";
  });
  const [databaseName, setDatabaseName] = useState("");
  const [databaseError, setDatabaseError] = useState("");
  const [appMode, setAppMode] = useState("tables");
  const [relations, setRelations] = useState([]);
  const [selectedTableName, setSelectedTableName] = useState("");
  const [columns, setColumns] = useState([]);
  const [selectedColumnNames, setSelectedColumnNames] = useState([]);
  const [filters, setFilters] = useState([]);
  const [columnValueOptions, setColumnValueOptions] = useState({});
  const [rows, setRows] = useState([]);
  const [rowLimit, setRowLimit] = useState("100");
  const [hasMoreRows, setHasMoreRows] = useState(false);
  const [hasRunReport, setHasRunReport] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [areRowsLeaving, setAreRowsLeaving] = useState(false);
  const [copiedCellId, setCopiedCellId] = useState("");
  const [hoveredCell, setHoveredCell] = useState(null);
  const [removingFilterIds, setRemovingFilterIds] = useState([]);
  const [isQueryTransitioning, setIsQueryTransitioning] = useState(false);
  const [brandImageFailed, setBrandImageFailed] = useState(false);
  const [crudMetadata, setCrudMetadata] = useState(null);
  const [crudDrawer, setCrudDrawer] = useState({
    mode: null,
    row: null,
    values: {},
    primaryKey: {},
  });
  const [isCrudDrawerClosing, setIsCrudDrawerClosing] = useState(false);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  const [isQueryScrolledToBottom, setIsQueryScrolledToBottom] = useState(true);
  const [functions, setFunctions] = useState([]);
  const [selectedFunctionName, setSelectedFunctionName] = useState("");
  const [functionParameters, setFunctionParameters] = useState([]);
  const [functionValues, setFunctionValues] = useState({});
  const [functionRows, setFunctionRows] = useState([]);
  const [hasRunFunction, setHasRunFunction] = useState(false);
  const [isExecutingFunction, setIsExecutingFunction] = useState(false);
  const [
    isFunctionResultScrolledToBottom,
    setIsFunctionResultScrolledToBottom,
  ] = useState(true);
  const copiedTimeoutRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const queryTransitionTimeoutRef = useRef(null);
  const crudDrawerCloseTimeoutRef = useRef(null);
  const tableWrapRef = useRef(null);
  const functionResultWrapRef = useRef(null);

  const selectedColumns = useMemo(
    () =>
      columns.filter((column) =>
        selectedColumnNames.includes(column.columnName),
      ),
    [columns, selectedColumnNames],
  );
  const tableOptions = useMemo(
    () =>
      relations.map((relation) => ({
        value: relation.tableName,
        label: relation.tableName,
        isView: relation.isView,
      })),
    [relations],
  );
  const columnOptions = useMemo(
    () =>
      columns.map((column) => ({
        value: column.columnName,
        label: column.columnName,
      })),
    [columns],
  );
  const writableCrudColumns = useMemo(
    () => (crudMetadata?.columns || []).filter((column) => column.isWritable),
    [crudMetadata],
  );
  const isCrudDrawerOpen = Boolean(crudDrawer.mode);
  const selectedFunction = useMemo(
    () =>
      functions.find(
        (candidate) => candidate.routineName === selectedFunctionName,
      ),
    [functions, selectedFunctionName],
  );

  function getColumnValueOptionsKey(tableName, columnName) {
    return `${tableName}:${columnName}`;
  }

  function getFunctionParameterKey(parameter, index) {
    return parameter.parameterName || `parameter${index + 1}`;
  }

  function sanitizeFunctionValue(value, dataType) {
    if (functionInputNumberTypes.has(dataType)) {
      return value
        .replace(/[^\d.-]/g, "")
        .replace(/(?!^)-/g, "")
        .replace(/(\..*)\./g, "$1");
    }

    return value;
  }

  function updateFunctionValue(parameter, index, value) {
    setFunctionValues((currentValues) => ({
      ...currentValues,
      [getFunctionParameterKey(parameter, index)]: sanitizeFunctionValue(
        value,
        parameter.dataType,
      ),
    }));
  }

  function normalizeFunctionValue(parameter, index) {
    const value = functionValues[getFunctionParameterKey(parameter, index)];

    if (value === "") {
      return null;
    }

    if (functionInputNumberTypes.has(parameter.dataType)) {
      return Number(value);
    }

    if (parameter.dataType === "boolean") {
      return value === true || value === "true";
    }

    return value;
  }

  function isMissingFunctionValue(parameter, index) {
    const value = functionValues[getFunctionParameterKey(parameter, index)];

    return (
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "")
    );
  }

  const hasMissingFunctionParameters = functionParameters.some(
    isMissingFunctionValue,
  );
  const isDashboardDisabled = Boolean(databaseError);

  async function executeFunction() {
    if (isDashboardDisabled) {
      return;
    }

    if (!selectedFunctionName) {
      return;
    }

    if (hasMissingFunctionParameters) {
      toast.warning("Fill all function parameters before executing.");
      return;
    }

    setIsExecutingFunction(true);

    try {
      const response = await fetch("./api/functions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          functionName: selectedFunctionName,
          parameters: functionParameters.map(normalizeFunctionValue),
        }),
      });
      const payload = await parseApiResponse(
        response,
        "Could not execute function.",
      );

      setFunctionRows(payload.rows || []);
      setHasRunFunction(true);
      toast.success(`${payload.rowCount || 0} rows returned`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsExecutingFunction(false);
    }
  }

  function updateQueryFadeState(element) {
    const hasVerticalScroll = element.scrollHeight > element.clientHeight + 2;
    const isAtBottom =
      element.scrollTop + element.clientHeight >= element.scrollHeight - 2;

    setIsQueryScrolledToBottom(!hasVerticalScroll || isAtBottom);
  }

  useEffect(() => {
    document.documentElement.dataset.theme = themeName;
    localStorage.setItem("pgDashboardTheme", themeName);
  }, [themeName]);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const healthResponse = await fetch("./api/health");
        const healthPayload = await parseApiResponse(
          healthResponse,
          "Could not load database info.",
        );

        if (!isMounted) {
          return;
        }

        setDatabaseName(healthPayload.databaseName || "");
        setDatabaseError("");

        const [tablesResponse, functionsResponse] = await Promise.all([
          fetch("./api/tables"),
          fetch("./api/functions"),
        ]);
        const tablesPayload = await parseApiResponse(
          tablesResponse,
          "Could not load tables.",
        );
        const functionsPayload = await parseApiResponse(
          functionsResponse,
          "Could not load functions.",
        );

        if (!isMounted) {
          return;
        }

        const nextRelations =
          tablesPayload.relations ||
          (tablesPayload.tables || []).map((tableName) => ({
            tableName,
            isView: false,
            relationType: "table",
          }));
        const nextFunctions = functionsPayload.functions || [];

        setRelations(nextRelations);
        setSelectedTableName(nextRelations[0]?.tableName || "");
        setFunctions(nextFunctions);
        setSelectedFunctionName(nextFunctions[0]?.routineName || "");

        if (!nextFunctions.length) {
          setAppMode("tables");
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setDatabaseName("");
        setDatabaseError(error.message);
        setRelations([]);
        setSelectedTableName("");
        setColumns([]);
        setSelectedColumnNames([]);
        setFilters([]);
        setRows([]);
        setFunctions([]);
        setSelectedFunctionName("");
        setFunctionParameters([]);
        setFunctionValues({});
        setFunctionRows([]);
        toast.error(error.message);
      }
    }

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedFunctionName) {
      setFunctionParameters([]);
      setFunctionValues({});
      setFunctionRows([]);
      setHasRunFunction(false);
      return;
    }

    fetch(
      `./api/functions/${encodeURIComponent(selectedFunctionName)}/parameters`,
    )
      .then((response) =>
        parseApiResponse(response, "Could not load function parameters."),
      )
      .then((payload) => {
        const nextParameters = payload.parameters || [];

        setFunctionParameters(nextParameters);
        setFunctionValues(
          Object.fromEntries(
            nextParameters.map((parameter, index) => [
              getFunctionParameterKey(parameter, index),
              "",
            ]),
          ),
        );
        setFunctionRows([]);
        setHasRunFunction(false);
      })
      .catch((error) => toast.error(error.message));
  }, [selectedFunctionName]);

  useEffect(() => {
    if (!selectedTableName) {
      return;
    }

    setIsQueryTransitioning(true);

    if (queryTransitionTimeoutRef.current) {
      window.clearTimeout(queryTransitionTimeoutRef.current);
    }

    fetch(`./api/tables/${encodeURIComponent(selectedTableName)}/columns`)
      .then((response) => parseApiResponse(response, "Could not load columns."))
      .then((payload) => {
        const nextColumns = payload.columns || [];
        const defaultColumnNames = nextColumns
          .filter((column) => shouldSelectColumnByDefault(column.columnName))
          .map((column) => column.columnName);
        setColumns(nextColumns);
        setSelectedColumnNames(
          defaultColumnNames.length
            ? defaultColumnNames
            : nextColumns.map((column) => column.columnName),
        );
        setFilters([]);
        setColumnValueOptions({});
        setRows([]);
        setHasMoreRows(false);
        setHasRunReport(false);
        queryTransitionTimeoutRef.current = window.setTimeout(() => {
          setIsQueryTransitioning(false);
        }, 180);
      })
      .catch((error) => {
        setIsQueryTransitioning(false);
        toast.error(error.message);
      });

    fetch(`./api/tables/${encodeURIComponent(selectedTableName)}/crud-meta`)
      .then((response) =>
        parseApiResponse(response, "Could not load CRUD metadata."),
      )
      .then((payload) => setCrudMetadata(payload))
      .catch((error) => {
        setCrudMetadata(null);
        toast.error(error.message);
      });
  }, [selectedTableName]);

  function toggleColumn(columnName) {
    setSelectedColumnNames((currentColumnNames) =>
      currentColumnNames.includes(columnName)
        ? currentColumnNames.filter(
            (currentColumnName) => currentColumnName !== columnName,
          )
        : [...currentColumnNames, columnName],
    );
  }

  function addFilter() {
    const firstColumn = columns[0];

    if (!firstColumn) {
      return;
    }

    setFilters((currentFilters) => [
      ...currentFilters,
      {
        id: crypto.randomUUID(),
        columnName: firstColumn.columnName,
        operator: "equals",
        value: "",
      },
    ]);
  }

  function updateFilter(index, patch) {
    setFilters((currentFilters) =>
      currentFilters.map((filter, filterIndex) =>
        filterIndex === index ? { ...filter, ...patch } : filter,
      ),
    );
  }

  function updateFilterColumn(index, columnName) {
    const column = columns.find(
      (candidate) => candidate.columnName === columnName,
    );
    const nextOperatorOptions = getOperatorOptionsForDataType(column?.dataType);

    setFilters((currentFilters) =>
      currentFilters.map((filter, filterIndex) => {
        if (filterIndex !== index) {
          return filter;
        }

        const hasValidOperator = nextOperatorOptions.some(
          (option) => option.value === filter.operator,
        );

        return {
          ...filter,
          columnName,
          operator: hasValidOperator
            ? filter.operator
            : nextOperatorOptions[0].value,
          value: sanitizeFilterValue(filter.value, column?.dataType),
        };
      }),
    );
  }

  function loadColumnValueOptions(columnName) {
    if (!selectedTableName || !columnName) {
      return;
    }

    const optionsKey = getColumnValueOptionsKey(selectedTableName, columnName);

    if (columnValueOptions[optionsKey]) {
      return;
    }

    fetch(
      `./api/tables/${encodeURIComponent(selectedTableName)}/columns/${encodeURIComponent(columnName)}/values`,
    )
      .then((response) => parseApiResponse(response, "Could not load values."))
      .then((payload) => {
        setColumnValueOptions((currentOptions) => ({
          ...currentOptions,
          [optionsKey]: payload.useDropdown
            ? payload.values.map((value) => ({ value, label: value }))
            : [],
        }));
      })
      .catch(() => {
        setColumnValueOptions((currentOptions) => ({
          ...currentOptions,
          [optionsKey]: [],
        }));
      });
  }

  useEffect(() => {
    filters.forEach((filter) => {
      const column = columns.find(
        (candidate) => candidate.columnName === filter.columnName,
      );
      const kind = getColumnKind(column?.dataType);

      if (kind === "text" || kind === "boolean" || kind === "basic") {
        loadColumnValueOptions(filter.columnName);
      }
    });
  }, [filters, columns, selectedTableName]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      if (tableWrapRef.current) {
        updateQueryFadeState(tableWrapRef.current);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [rows, selectedColumnNames, hasRunReport, isLoading]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      if (functionResultWrapRef.current) {
        const element = functionResultWrapRef.current;
        const hasVerticalScroll =
          element.scrollHeight > element.clientHeight + 2;
        const isAtBottom =
          element.scrollTop + element.clientHeight >= element.scrollHeight - 2;

        setIsFunctionResultScrolledToBottom(!hasVerticalScroll || isAtBottom);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [functionRows, hasRunFunction]);

  function updateFilterValue(index, value) {
    setFilters((currentFilters) =>
      currentFilters.map((filter, filterIndex) => {
        if (filterIndex !== index) {
          return filter;
        }

        const column = columns.find(
          (candidate) => candidate.columnName === filter.columnName,
        );

        return {
          ...filter,
          value: sanitizeFilterValue(value, column?.dataType),
        };
      }),
    );
  }

  function removeFilter(index) {
    const filter = filters[index];

    if (!filter) {
      return;
    }

    setRemovingFilterIds((currentIds) => [...currentIds, filter.id]);
    window.setTimeout(() => {
      setFilters((currentFilters) =>
        currentFilters.filter(
          (currentFilter) => currentFilter.id !== filter.id,
        ),
      );
      setRemovingFilterIds((currentIds) =>
        currentIds.filter((filterId) => filterId !== filter.id),
      );
    }, 180);
  }

  function clearFilters() {
    if (!filters.length) {
      return;
    }

    const filterIds = filters.map((filter) => filter.id);
    setRemovingFilterIds((currentIds) => [...currentIds, ...filterIds]);
    window.setTimeout(() => {
      setFilters([]);
      setRemovingFilterIds((currentIds) =>
        currentIds.filter((filterId) => !filterIds.includes(filterId)),
      );
    }, 180);
  }

  function getPrimaryKeyFromRow(row) {
    const primaryKeyColumns = crudMetadata?.primaryKeyColumns || [];

    if (!primaryKeyColumns.length) {
      return null;
    }

    const primaryKey = {};

    for (const columnName of primaryKeyColumns) {
      if (
        row[columnName] === undefined ||
        row[columnName] === null ||
        row[columnName] === ""
      ) {
        return null;
      }

      primaryKey[columnName] = row[columnName];
    }

    return primaryKey;
  }

  function openCreateDrawer() {
    const values = Object.fromEntries(
      writableCrudColumns.map((column) => [column.columnName, ""]),
    );

    if (crudDrawerCloseTimeoutRef.current) {
      window.clearTimeout(crudDrawerCloseTimeoutRef.current);
    }

    setIsCrudDrawerClosing(false);
    setCrudDrawer({ mode: "create", row: null, values, primaryKey: {} });
  }

  async function loadFullRow(primaryKey) {
    const response = await fetch(
      `./api/tables/${encodeURIComponent(selectedTableName)}/records/find`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryKey }),
      },
    );
    const payload = await parseApiResponse(response, "Could not load record.");

    return payload.row;
  }

  async function openEditDrawer(row) {
    const primaryKey = getPrimaryKeyFromRow(row);

    if (!primaryKey) {
      toast.error("Select primary key columns to edit this row.");
      return;
    }

    setIsLoadingRecord(true);

    try {
      const fullRow = await loadFullRow(primaryKey);
      const values = Object.fromEntries(
        writableCrudColumns.map((column) => [
          column.columnName,
          formatCrudInputValue(fullRow[column.columnName], column),
        ]),
      );

      if (crudDrawerCloseTimeoutRef.current) {
        window.clearTimeout(crudDrawerCloseTimeoutRef.current);
      }

      setIsCrudDrawerClosing(false);
      setCrudDrawer({ mode: "edit", row: fullRow, values, primaryKey });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsLoadingRecord(false);
    }
  }

  function openDeleteDrawer(row) {
    const primaryKey = getPrimaryKeyFromRow(row);

    if (!primaryKey) {
      toast.error("Select primary key columns to delete this row.");
      return;
    }

    if (crudDrawerCloseTimeoutRef.current) {
      window.clearTimeout(crudDrawerCloseTimeoutRef.current);
    }

    setIsCrudDrawerClosing(false);
    setCrudDrawer({ mode: "delete", row, values: {}, primaryKey });
  }

  function closeCrudDrawer(force = false) {
    if (!crudDrawer.mode || (!force && isSavingRecord)) {
      return;
    }

    setIsCrudDrawerClosing(true);

    if (crudDrawerCloseTimeoutRef.current) {
      window.clearTimeout(crudDrawerCloseTimeoutRef.current);
    }

    crudDrawerCloseTimeoutRef.current = window.setTimeout(() => {
      setCrudDrawer({ mode: null, row: null, values: {}, primaryKey: {} });
      setIsCrudDrawerClosing(false);
    }, 210);
  }

  function updateCrudValue(columnName, value) {
    setCrudDrawer((currentDrawer) => ({
      ...currentDrawer,
      values: {
        ...currentDrawer.values,
        [columnName]: value,
      },
    }));
  }

  function buildCrudValues(mode) {
    return Object.fromEntries(
      writableCrudColumns
        .map((column) => [
          column.columnName,
          normalizeCrudValue(
            crudDrawer.values[column.columnName],
            column,
            mode,
          ),
        ])
        .filter(([, value]) => value !== undefined),
    );
  }

  function validateCrudValues(mode) {
    if (mode === "delete") {
      return true;
    }

    const missingColumn = writableCrudColumns.find((column) => {
      const value = crudDrawer.values[column.columnName];

      if (mode === "create" && column.hasDefault) {
        return false;
      }

      return (
        !column.isNullable &&
        (value === undefined || value === null || value === "")
      );
    });

    if (missingColumn) {
      toast.error(`${missingColumn.columnName} is required.`);
      return false;
    }

    const incompleteTimestampColumn = writableCrudColumns.find((column) => {
      if (!column.dataType?.startsWith("timestamp")) {
        return false;
      }

      const value = crudDrawer.values[column.columnName];

      if (!value) {
        return false;
      }

      const { date, time } = splitDateTimeInputValue(value);

      return date.length !== 10 || time.length !== 5;
    });

    if (incompleteTimestampColumn) {
      toast.error(
        `${incompleteTimestampColumn.columnName} needs date and time.`,
      );
      return false;
    }

    return true;
  }

  async function refreshReportAfterCrud() {
    if (hasRunReport) {
      await generateReport();
    }
  }

  async function submitCrud(event) {
    event.preventDefault();

    if (!crudDrawer.mode) {
      return;
    }

    if (!validateCrudValues(crudDrawer.mode)) {
      return;
    }

    setIsSavingRecord(true);

    try {
      const mode = crudDrawer.mode;
      const isDelete = mode === "delete";
      const response = await fetch(
        `./api/tables/${encodeURIComponent(selectedTableName)}/records`,
        {
          method:
            mode === "create" ? "POST" : mode === "edit" ? "PATCH" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isDelete
              ? { primaryKey: crudDrawer.primaryKey }
              : {
                  primaryKey:
                    mode === "edit" ? crudDrawer.primaryKey : undefined,
                  values: buildCrudValues(mode),
                },
          ),
        },
      );
      await parseApiResponse(response, "Could not save record.");

      closeCrudDrawer(true);
      await refreshReportAfterCrud();
      toast.success(
        mode === "create"
          ? "Record created"
          : mode === "edit"
            ? "Record updated"
            : "Record deleted",
      );
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSavingRecord(false);
    }
  }

  async function copyGridValue(cellId, value) {
    const text = value === null || value === undefined ? "NULL" : String(value);

    try {
      await copyTextToClipboard(text);
      setCopiedCellId(cellId);

      if (copiedTimeoutRef.current) {
        window.clearTimeout(copiedTimeoutRef.current);
      }

      copiedTimeoutRef.current = window.setTimeout(() => {
        setCopiedCellId("");
      }, 1400);
    } catch (error) {
      toast.error("Could not copy value.");
    }
  }

  function showCellTooltipLater(cellId, value) {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
    }

    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredCell({
        id: cellId,
        text: value === null || value === undefined ? "NULL" : String(value),
      });
    }, 700);
  }

  function hideCellTooltip() {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
    }

    setHoveredCell(null);
  }

  async function generateReport(event) {
    event?.preventDefault();

    if (isDashboardDisabled) {
      return;
    }

    const invalidFilter = filters.find((filter) => {
      if (filter.operator === "isNull" || filter.operator === "isNotNull") {
        return false;
      }

      return filter.value === "";
    });

    if (invalidFilter) {
      toast.error("Fill in filter values before running.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("./api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableName: selectedTableName,
          columnNames: selectedColumnNames,
          filters,
          limit: rowLimit,
        }),
      });
      const payload = await parseApiResponse(
        response,
        "Could not generate report.",
      );

      const nextRows = payload.rows || [];
      setAreRowsLeaving(rows.length > 0);
      window.setTimeout(
        () => {
          setRows(nextRows);
          setAreRowsLeaving(false);
        },
        rows.length > 0 ? 180 : 0,
      );
      setHasMoreRows(Boolean(payload.hasMore));
      setHasRunReport(true);
      toast.success(`${payload.rowCount || 0} rows loaded`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="shell">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3200,
          className: "dashboardToast",
          success: {
            iconTheme: {
              primary: "#148a5b",
              secondary: "#ffffff",
            },
          },
          error: {
            iconTheme: {
              primary: "#F25F4C",
              secondary: "#ffffff",
            },
          },
        }}
      />
      <section className="toolbar">
        <div className="brandBlock">
          <div className="brandIcon">
            {!brandImageFailed ? (
              <img
                alt=""
                src={brandIconUrl}
                onError={() => setBrandImageFailed(true)}
              />
            ) : (
              <Database size={24} />
            )}
          </div>
          <div>
            <h1>PG Dashboard</h1>
            <p className="brandDatabase">
              <Database size={13} />
              {databaseError || databaseName || "Database not loaded"}
            </p>
          </div>
        </div>
        <div className="toolbarActions">
          <div className="resultMeta">
            {appMode === "functions" ? (
              <Code2 size={15} />
            ) : (
              <Rows3 size={15} />
            )}
            <span>
              {appMode === "functions"
                ? functionRows.length
                  ? `${functionRows.length} rows returned`
                  : "Ready to execute"
                : rows.length
                  ? `${rows.length} rows loaded`
                  : "Ready to run"}
            </span>
            {appMode === "tables" && hasMoreRows ? (
              <span className="moreRowsBadge">
                <Sparkles size={12} />
                More after limit
              </span>
            ) : appMode === "tables" && rows.length ? (
              <span className="allRowsBadge">All loaded</span>
            ) : null}
          </div>
          {appMode === "tables" ? (
            <label className="limitControl">
              <span className="limitLabel">
                <SlidersHorizontal size={14} />
                Limit
              </span>
              <input
                aria-label="Row limit"
                inputMode="numeric"
                value={rowLimit}
                disabled={isDashboardDisabled}
                onChange={(event) =>
                  setRowLimit(event.target.value.replace(/\D/g, "").slice(0, 3))
                }
              />
            </label>
          ) : null}
          <button
            type="button"
            className="iconButton"
            onClick={() =>
              setThemeName((currentThemeName) =>
                currentThemeName === "dark" ? "light" : "dark",
              )
            }
            disabled={isDashboardDisabled}
            title={
              themeName === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme"
            }
          >
            {themeName === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <ExportMenu
            disabled={
              isDashboardDisabled ||
              (appMode === "functions" ? !functionRows.length : !rows.length)
            }
            onExportCsv={() =>
              downloadCsv(
                appMode === "functions" ? functionRows : rows,
                `${appMode === "functions" ? selectedFunctionName || "function" : selectedTableName || "report"}.csv`,
              )
            }
            onExportExcel={() =>
              downloadExcel(
                appMode === "functions" ? functionRows : rows,
                `${appMode === "functions" ? selectedFunctionName || "function" : selectedTableName || "report"}.xls`,
              )
            }
          />
          {appMode === "tables" ? (
            <button
              type="button"
              className="primary buttonWithIcon"
              onClick={openCreateDrawer}
              disabled={isDashboardDisabled || !crudMetadata?.canCreate}
              title={
                crudMetadata?.canCreate
                  ? "Create record"
                  : "This relation is read-only"
              }
            >
              <Plus size={16} />
              New
            </button>
          ) : null}
        </div>
      </section>

      <form
        className="layout"
        onSubmit={(event) => {
          if (appMode === "functions") {
            event.preventDefault();
            executeFunction();
            return;
          }

          generateReport(event);
        }}
      >
        <aside className="panel">
          {databaseError ? (
            <div className="databaseUnavailable">
              <AlertCircle size={18} />
              <div>
                <strong>Database unavailable</strong>
                <span>Check the connection config to unlock the dashboard.</span>
              </div>
            </div>
          ) : null}

          <div className="modeTabs" role="tablist" aria-label="Dashboard mode">
            <button
              type="button"
              className={
                appMode === "tables" ? "modeTab modeTabActive" : "modeTab"
              }
              onClick={() => setAppMode("tables")}
              disabled={isDashboardDisabled}
            >
              <Rows3 size={15} />
              Tables
            </button>
            <button
              type="button"
              className={
                appMode === "functions" ? "modeTab modeTabActive" : "modeTab"
              }
              onClick={() => setAppMode("functions")}
              disabled={isDashboardDisabled || !functions.length}
              title={
                functions.length
                  ? "Open functions"
                  : "No functions found in the database"
              }
            >
              <Code2 size={15} />
              Functions
            </button>
          </div>

          {appMode === "tables" ? (
            <>
              <div className="fieldGroup">
                <span>Table</span>
                <CustomDropdown
                  ariaLabel="Select table"
                  value={selectedTableName}
                  options={tableOptions}
                  onChange={setSelectedTableName}
                  placeholder="Select table"
                  disabled={isDashboardDisabled}
                />
              </div>

              <div className="panelSection">
                <div className="groupTitle">Columns</div>
                <div className="checkList">
                  {columns.map((column) => (
                    <label key={column.columnName} className="checkRow">
                      <input
                        type="checkbox"
                        checked={selectedColumnNames.includes(
                          column.columnName,
                        )}
                        onChange={() => toggleColumn(column.columnName)}
                        disabled={isDashboardDisabled}
                      />
                      <span className="checkDot" aria-hidden="true" />
                      <span className="columnName">{column.columnName}</span>
                      <small className="typePill" title={column.dataType}>
                        {formatDataType(column.dataType)}
                      </small>
                    </label>
                  ))}
                </div>
              </div>

              <div className="panelSection filters">
                <div className="filtersHeader">
                  <div>
                    <div className="groupTitle">Filters</div>
                    <p className="sectionHint">Refine rows before running.</p>
                  </div>
                  <div className="filtersActions">
                    <button
                      type="button"
                      className="iconButton clearFiltersButton"
                      onClick={clearFilters}
                      disabled={isDashboardDisabled || !filters.length}
                      title="Clear filters"
                    >
                      <X size={17} />
                    </button>
                    <button
                      type="button"
                      className="iconButton addFilterButton"
                      onClick={addFilter}
                      disabled={isDashboardDisabled}
                      title="Add filter"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>

                <div className="filterList">
                  {!filters.length ? (
                    <div className="emptyFilters">
                      <Search size={16} />
                      <span>No filters applied</span>
                    </div>
                  ) : null}

                  {filters.map((filter, index) => {
                    const column = columns.find(
                      (candidate) => candidate.columnName === filter.columnName,
                    );
                    const isNumericValue = numberTypes.has(column?.dataType);
                    const valueOptions =
                      columnValueOptions[
                        getColumnValueOptionsKey(
                          selectedTableName,
                          filter.columnName,
                        )
                      ] || [];
                    const shouldUseValueDropdown =
                      valueOptions.length > 0 &&
                      filter.operator !== "isNull" &&
                      filter.operator !== "isNotNull";

                    return (
                      <div
                        key={filter.id}
                        className={
                          removingFilterIds.includes(filter.id)
                            ? "filterCard filterCardLeaving"
                            : "filterCard"
                        }
                      >
                        <div className="filterLabel">
                          <span>Where</span>
                          <strong>#{index + 1}</strong>
                        </div>
                        <CustomDropdown
                          ariaLabel="Filter column"
                          value={filter.columnName}
                          options={columnOptions}
                          onChange={(columnName) =>
                            updateFilterColumn(index, columnName)
                          }
                          placeholder="Column"
                          disabled={isDashboardDisabled}
                        />
                        <CustomDropdown
                          ariaLabel="Filter operator"
                          value={filter.operator}
                          options={getOperatorOptionsForDataType(
                            column?.dataType,
                          )}
                          onChange={(operator) =>
                            updateFilter(index, { operator })
                          }
                          placeholder="Operator"
                          disabled={isDashboardDisabled}
                        />
                        <div className="filterValueRow">
                          {shouldUseValueDropdown ? (
                            <CustomDropdown
                              ariaLabel="Filter value"
                              value={filter.value}
                              options={valueOptions}
                              onChange={(value) =>
                                updateFilter(index, { value })
                              }
                              placeholder="Value"
                              disabled={isDashboardDisabled}
                            />
                          ) : (
                            <input
                              aria-label="Filter value"
                              inputMode={isNumericValue ? "numeric" : "text"}
                              value={filter.value}
                              placeholder="Value"
                              onChange={(event) =>
                                updateFilterValue(index, event.target.value)
                              }
                              disabled={
                                isDashboardDisabled ||
                                filter.operator === "isNull" ||
                                filter.operator === "isNotNull"
                              }
                            />
                          )}
                          <button
                            type="button"
                            className="iconButton dangerButton"
                            onClick={() => removeFilter(index)}
                            disabled={isDashboardDisabled}
                            title="Remove filter"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  className="primary buttonWithIcon"
                  type="submit"
                  disabled={
                    isDashboardDisabled || isLoading || !selectedColumnNames.length
                  }
                >
                  <Play size={16} />
                  {isLoading ? "Running..." : "Run"}
                </button>
              </div>
            </>
          ) : (
            <div className="functionsPanel">
              <div className="fieldGroup">
                <span>Function</span>
                <CustomDropdown
                  ariaLabel="Select function"
                  value={selectedFunctionName}
                  options={functions.map((routine) => ({
                    value: routine.routineName,
                    label: routine.routineName,
                  }))}
                  onChange={setSelectedFunctionName}
                  placeholder="Select function"
                  disabled={isDashboardDisabled}
                />
              </div>

              {selectedFunction ? (
                <div className="functionSignature">
                  <Code2 size={15} />
                  <span>{selectedFunction.returnType || "unknown"}</span>
                </div>
              ) : null}

              <div className="panelSection functionParams">
                <div>
                  <div className="groupTitle">Parameters</div>
                  <p className="sectionHint">
                    Fill values and execute the stored function.
                  </p>
                </div>

                <div className="functionParamList">
                  {!functionParameters.length ? (
                    <div className="emptyFilters">
                      <Sparkles size={16} />
                      <span>No parameters required</span>
                    </div>
                  ) : null}

                  {functionParameters.map((parameter, index) => {
                    const parameterKey = getFunctionParameterKey(
                      parameter,
                      index,
                    );
                    const value = functionValues[parameterKey] ?? "";

                    return (
                      <label className="functionParam" key={parameterKey}>
                        <span>
                          {parameter.parameterName || `parameter ${index + 1}`}
                        </span>
                        {parameter.isEnum ? (
                          <CustomDropdown
                            ariaLabel={`${parameterKey} value`}
                            value={String(value)}
                            options={[
                              { value: "", label: "Select value" },
                              ...(parameter.enumValues || []).map(
                                (enumValue) => ({
                                  value: enumValue,
                                  label: enumValue,
                                }),
                              ),
                            ]}
                            onChange={(nextValue) =>
                              updateFunctionValue(parameter, index, nextValue)
                            }
                            placeholder="Value"
                            disabled={isDashboardDisabled}
                          />
                        ) : parameter.dataType === "boolean" ? (
                          <CustomDropdown
                            ariaLabel={`${parameterKey} value`}
                            value={String(value)}
                            options={[
                              { value: "", label: "Null" },
                              { value: "true", label: "True" },
                              { value: "false", label: "False" },
                            ]}
                            onChange={(nextValue) =>
                              updateFunctionValue(parameter, index, nextValue)
                            }
                            placeholder="Value"
                            disabled={isDashboardDisabled}
                          />
                        ) : (
                          <input
                            type="text"
                            inputMode={
                              functionInputNumberTypes.has(parameter.dataType)
                                ? "decimal"
                                : "text"
                            }
                            value={value}
                            onChange={(event) =>
                              updateFunctionValue(
                                parameter,
                                index,
                                event.target.value,
                              )
                            }
                            placeholder="Value"
                            disabled={isDashboardDisabled}
                          />
                        )}
                        <small className="typePill">
                          {parameter.isEnum
                            ? formatDataType(parameter.udtName)
                            : formatDataType(parameter.dataType)}
                        </small>
                      </label>
                    );
                  })}
                </div>

                <button
                  className="primary buttonWithIcon"
                  type="button"
                  disabled={
                    !selectedFunctionName ||
                    isDashboardDisabled ||
                    isExecutingFunction ||
                    hasMissingFunctionParameters
                  }
                  onClick={executeFunction}
                  title={
                    hasMissingFunctionParameters
                      ? "Fill all function parameters before executing"
                      : "Execute function"
                  }
                >
                  <Zap size={16} />
                  Execute
                </button>
              </div>
            </div>
          )}
        </aside>

        <section className="workspace">
          {databaseError ? (
            <div className="tableWrap tableWrapAtBottom">
              <div className="emptyQueryState">
                <AlertCircle size={22} />
                <strong>Database unavailable</strong>
                <span>{databaseError}</span>
              </div>
            </div>
          ) : appMode === "functions" ? (
            <div
              ref={functionResultWrapRef}
              className={[
                "tableWrap",
                isFunctionResultScrolledToBottom ? "tableWrapAtBottom" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onScroll={(event) => {
                const element = event.currentTarget;
                const hasVerticalScroll =
                  element.scrollHeight > element.clientHeight + 2;
                const isAtBottom =
                  element.scrollTop + element.clientHeight >=
                  element.scrollHeight - 2;

                setIsFunctionResultScrolledToBottom(
                  !hasVerticalScroll || isAtBottom,
                );
              }}
            >
              {!hasRunFunction ? (
                <div className="emptyQueryState">
                  <Code2 size={20} />
                  <strong>Ready to execute</strong>
                  <span>Select a function, fill parameters, and run it.</span>
                </div>
              ) : null}

              {hasRunFunction && functionRows.length === 0 ? (
                <div className="emptyQueryState">
                  <Search size={20} />
                  <strong>No rows returned</strong>
                  <span>The function executed, but returned no rows.</span>
                </div>
              ) : null}

              {hasRunFunction && functionRows.length > 0 ? (
                <div className="dataGrid" role="table">
                  <div className="dataGridHeader" role="row">
                    {Object.keys(functionRows[0]).map((columnName) => (
                      <div
                        className="dataGridCell dataGridHeadCell"
                        key={columnName}
                        role="columnheader"
                      >
                        <span className="dataGridContent">{columnName}</span>
                      </div>
                    ))}
                    <div
                      className="dataGridCell dataGridHeadCell dataGridFillerCell"
                      role="presentation"
                    />
                  </div>
                  <div className="dataGridBody" role="rowgroup">
                    {functionRows.map((row, rowIndex) => (
                      <div className="dataGridRow" key={rowIndex} role="row">
                        {Object.keys(functionRows[0]).map((columnName) => {
                          const cellId = `function:${rowIndex}:${columnName}`;

                          return (
                            <div
                              className={[
                                "dataGridCell",
                                copiedCellId === cellId ? "copiedCell" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              key={columnName}
                              role="cell"
                              onClick={() =>
                                copyGridValue(cellId, row[columnName])
                              }
                              onMouseEnter={
                                row[columnName] !== null &&
                                row[columnName] !== undefined
                                  ? () =>
                                      showCellTooltipLater(
                                        cellId,
                                        row[columnName],
                                      )
                                  : undefined
                              }
                              onMouseLeave={hideCellTooltip}
                              onFocus={
                                row[columnName] !== null &&
                                row[columnName] !== undefined
                                  ? () =>
                                      showCellTooltipLater(
                                        cellId,
                                        row[columnName],
                                      )
                                  : undefined
                              }
                              onBlur={hideCellTooltip}
                            >
                              <span className="dataGridContent">
                                {row[columnName] === null ? (
                                  <span className="nullValue">NULL</span>
                                ) : (
                                  String(row[columnName] ?? "")
                                )}
                              </span>
                              {copiedCellId === cellId ? (
                                <span className="copyBubble">
                                  <Copy size={12} />
                                  Copied
                                </span>
                              ) : null}
                              {hoveredCell?.id === cellId &&
                              copiedCellId !== cellId ? (
                                <span className="cellTooltip">
                                  {hoveredCell.text}
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                        <div
                          className="dataGridCell dataGridFillerCell"
                          role="presentation"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div
              ref={tableWrapRef}
              className={[
                "tableWrap",
                isQueryScrolledToBottom ? "tableWrapAtBottom" : "",
                isQueryTransitioning ? "tableWrapTransitioning" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onScroll={(event) => updateQueryFadeState(event.currentTarget)}
            >
              {!hasRunReport ? (
                <div className="emptyQueryState">
                  <Rows3 size={20} />
                  <strong>Ready when you are</strong>
                  <span>
                    Select columns, add optional filters, and run a report.
                  </span>
                </div>
              ) : null}
              {hasRunReport && !isLoading && rows.length === 0 ? (
                <div className="emptyQueryState">
                  <Search size={20} />
                  <strong>No results</strong>
                  <span>
                    Try changing filters, selected columns, or the row limit.
                  </span>
                </div>
              ) : null}
              <div className="dataGrid" role="table">
                <div className="dataGridHeader" role="row">
                  {crudMetadata?.isWritable ? (
                    <div
                      className="dataGridCell dataGridHeadCell dataGridActionCell"
                      role="columnheader"
                    >
                      <span className="dataGridContent">Actions</span>
                    </div>
                  ) : null}
                  {columns.map((column) => {
                    const isSelected = selectedColumnNames.includes(
                      column.columnName,
                    );

                    return (
                      <div
                        className={
                          isSelected
                            ? "dataGridCell dataGridHeadCell"
                            : "dataGridCell dataGridHeadCell dataGridCellHidden"
                        }
                        key={column.columnName}
                        role="columnheader"
                      >
                        <span className="dataGridContent">
                          {column.columnName}
                        </span>
                      </div>
                    );
                  })}
                  <div
                    className="dataGridCell dataGridHeadCell dataGridFillerCell"
                    role="presentation"
                  />
                </div>

                <div className="dataGridBody" role="rowgroup">
                  {rows.map((row, index) => (
                    <div
                      className={
                        areRowsLeaving
                          ? "dataGridRow dataGridRowLeaving"
                          : "dataGridRow"
                      }
                      key={index}
                      role="row"
                    >
                      {crudMetadata?.isWritable
                        ? (() => {
                            const primaryKey = getPrimaryKeyFromRow(row);

                            return (
                              <div
                                className="dataGridCell dataGridActionCell"
                                role="cell"
                              >
                                <div className="rowActions">
                                  <button
                                    type="button"
                                    className="iconButton"
                                    onClick={() => openEditDrawer(row)}
                                    disabled={
                                      !crudMetadata?.canUpdate ||
                                      !primaryKey ||
                                      isLoadingRecord
                                    }
                                    title="Edit row"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className="iconButton dangerButton"
                                    onClick={() => openDeleteDrawer(row)}
                                    disabled={
                                      !crudMetadata?.canDelete || !primaryKey
                                    }
                                    title="Delete row"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            );
                          })()
                        : null}
                      {columns.map((column) => {
                        const isSelected = selectedColumnNames.includes(
                          column.columnName,
                        );
                        const cellId = `${index}:${column.columnName}`;

                        return (
                          <div
                            className={[
                              "dataGridCell",
                              !isSelected ? "dataGridCellHidden" : "",
                              copiedCellId === cellId ? "copiedCell" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            key={column.columnName}
                            role="cell"
                            onClick={() =>
                              isSelected
                                ? copyGridValue(cellId, row[column.columnName])
                                : undefined
                            }
                            onMouseEnter={
                              isSelected &&
                              row[column.columnName] !== null &&
                              row[column.columnName] !== undefined
                                ? () =>
                                    showCellTooltipLater(
                                      cellId,
                                      row[column.columnName],
                                    )
                                : undefined
                            }
                            onMouseLeave={hideCellTooltip}
                            onFocus={
                              isSelected &&
                              row[column.columnName] !== null &&
                              row[column.columnName] !== undefined
                                ? () =>
                                    showCellTooltipLater(
                                      cellId,
                                      row[column.columnName],
                                    )
                                : undefined
                            }
                            onBlur={hideCellTooltip}
                          >
                            <span className="dataGridContent">
                              {row[column.columnName] === null ? (
                                <span className="nullValue">NULL</span>
                              ) : (
                                String(row[column.columnName] ?? "")
                              )}
                            </span>
                            {copiedCellId === cellId ? (
                              <span className="copyBubble">
                                <Copy size={12} />
                                Copied
                              </span>
                            ) : null}
                            {hoveredCell?.id === cellId &&
                            copiedCellId !== cellId ? (
                              <span className="cellTooltip">
                                {hoveredCell.text}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                      <div
                        className="dataGridCell dataGridFillerCell"
                        role="presentation"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </form>

      {isCrudDrawerOpen ? (
        <div
          className={
            isCrudDrawerClosing
              ? "drawerOverlay drawerOverlayClosing"
              : "drawerOverlay"
          }
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCrudDrawer();
            }
          }}
        >
          <form
            className={
              isCrudDrawerClosing
                ? "crudDrawer crudDrawerClosing"
                : "crudDrawer"
            }
            onSubmit={submitCrud}
          >
            <div className="drawerHeader">
              <div>
                <span className="drawerEyebrow">
                  {crudDrawer.mode === "create"
                    ? "Create"
                    : crudDrawer.mode === "edit"
                      ? "Edit"
                      : "Delete"}
                </span>
                <h2>{selectedTableName}</h2>
              </div>
              <button
                type="button"
                className="iconButton"
                onClick={closeCrudDrawer}
                title="Close"
              >
                <X size={17} />
              </button>
            </div>

            {crudDrawer.mode === "delete" ? (
              <div className="deletePanel">
                <Trash2 size={22} />
                <strong>Delete this record?</strong>
                <span>
                  This action will run a real DELETE using the primary key.
                </span>
                <div className="primaryKeyPreview">
                  {Object.entries(crudDrawer.primaryKey).map(([key, value]) => (
                    <span key={key}>
                      {key}: <strong>{String(value)}</strong>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="crudFields">
                {writableCrudColumns.map((column) => {
                  const value = crudDrawer.values[column.columnName] ?? "";
                  const isBoolean = column.dataType === "boolean";
                  const isLongText = column.dataType === "text";
                  const isTimestamp = column.dataType?.startsWith("timestamp");
                  const dateTimeParts = splitDateTimeInputValue(value);
                  const enumOptions = column.isEnum
                    ? [
                        ...(column.isNullable || column.hasDefault
                          ? [
                              {
                                value: "",
                                label: column.hasDefault ? "Default" : "Empty",
                              },
                            ]
                          : []),
                        ...column.enumValues.map((enumValue) => ({
                          value: enumValue,
                          label: enumValue,
                        })),
                      ]
                    : [];

                  return (
                    <label className="crudField" key={column.columnName}>
                      <span>
                        {column.columnName}
                        {!column.isNullable && !column.hasDefault ? (
                          <strong>*</strong>
                        ) : null}
                      </span>
                      {column.isEnum ? (
                        <CustomDropdown
                          ariaLabel={`${column.columnName} value`}
                          value={value}
                          options={enumOptions}
                          onChange={(nextValue) =>
                            updateCrudValue(column.columnName, nextValue)
                          }
                          placeholder="Select value"
                        />
                      ) : isBoolean ? (
                        <button
                          type="button"
                          className={
                            value === true || value === "true"
                              ? "toggleButton toggleButtonOn"
                              : "toggleButton"
                          }
                          onClick={() =>
                            updateCrudValue(
                              column.columnName,
                              !(value === true || value === "true"),
                            )
                          }
                        >
                          {value === true || value === "true"
                            ? "True"
                            : "False"}
                        </button>
                      ) : isTimestamp ? (
                        <div className="dateTimeField">
                          <label>
                            <span>Date</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={10}
                              placeholder="dd/mm/yyyy"
                              value={dateTimeParts.date}
                              onChange={(event) =>
                                updateCrudValue(
                                  column.columnName,
                                  mergeDateTimeInputValue(
                                    value,
                                    "date",
                                    formatMaskedDateInput(event.target.value),
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>Time</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={5}
                              placeholder="HH:mm"
                              value={dateTimeParts.time}
                              onChange={(event) =>
                                updateCrudValue(
                                  column.columnName,
                                  mergeDateTimeInputValue(
                                    value,
                                    "time",
                                    formatMaskedTimeInput(event.target.value),
                                  ),
                                )
                              }
                            />
                          </label>
                        </div>
                      ) : isLongText ? (
                        <textarea
                          value={value}
                          onChange={(event) =>
                            updateCrudValue(
                              column.columnName,
                              event.target.value,
                            )
                          }
                          placeholder={column.hasDefault ? "Default" : "Value"}
                        />
                      ) : (
                        <input
                          type={getInputTypeForDataType(column.dataType)}
                          inputMode={
                            numberTypes.has(column.dataType)
                              ? "decimal"
                              : "text"
                          }
                          value={value}
                          onChange={(event) =>
                            updateCrudValue(
                              column.columnName,
                              event.target.value,
                            )
                          }
                          placeholder={column.hasDefault ? "Default" : "Value"}
                        />
                      )}
                      <small>{formatDataType(column.dataType)}</small>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="drawerActions">
              <button type="button" onClick={closeCrudDrawer}>
                Cancel
              </button>
              <button
                type="submit"
                className={
                  crudDrawer.mode === "delete"
                    ? "dangerConfirm buttonWithIcon"
                    : "primary buttonWithIcon"
                }
                disabled={isSavingRecord}
              >
                {crudDrawer.mode === "delete" ? (
                  <Trash2 size={16} />
                ) : (
                  <Check size={16} />
                )}
                {isSavingRecord
                  ? "Saving..."
                  : crudDrawer.mode === "delete"
                    ? "Delete"
                    : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
