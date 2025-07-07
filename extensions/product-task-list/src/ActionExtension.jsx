// src/index.jsx
import { useEffect, useState } from "react";
import {
  reactExtension,
  useApi,
  AdminAction,
  BlockStack,
  Button,
  Text,
  TextField,
  InlineStack,
  Checkbox,
  Banner,
  ProgressIndicator,
  Divider,
  Box,
  Heading,
  Badge,
} from "@shopify/ui-extensions-react/admin";

import { SUPABASE_URL, SUPABASE_KEY } from "../../../helpers/supabase.config";

const TARGET = "admin.product-details.action.render";

export default reactExtension(TARGET, () => <App />);

function App() {
  const { close, data } = useApi(TARGET);
  const [productId, setProductId] = useState(null);
  const [task, setTask] = useState("");
  const [tasks, setTasks] = useState([]);
  const [suggestedTasks, setSuggestedTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    if (data?.selected?.[0]?.id) {
      setProductId(data.selected[0].id);
    }
  }, [data]);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    fetch(
      `${SUPABASE_URL}/rest/v1/product_tasks?product_id=eq.${productId}&order=created_at.desc`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      },
    )
      .then((res) => res.json())
      .then((data) => {
        setTasks(data);
        evaluateSuggestions(data);
      })
      .catch(() => setError("Error al cargar las tareas"))
      .finally(() => setLoading(false));
  }, [productId]);

  const evaluateSuggestions = async (existingTasks) => {
    const existingTexts = existingTasks.map((t) => t.task);

    const query = {
      query: `query ProductDetails($id: ID!) {
        product(id: $id) {
          title
          descriptionHtml
          images(first: 1) {
            edges {
              node {
                originalSrc
              }
            }
          }
        }
      }`,
      variables: { id: productId },
    };

    const res = await fetch("shopify:admin/api/graphql.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(query),
    });

    const result = await res.json();
    const product = result?.data?.product;
    if (!product) return;

    const suggestions = [];

    if (
      !product.images.edges.length &&
      !existingTexts.includes("Agregar imagen destacada")
    ) {
      suggestions.push("Agregar imagen destacada");
    }

    if (
      (!product.descriptionHtml || product.descriptionHtml.length < 50) &&
      !existingTexts.includes("Completar descripción del producto")
    ) {
      suggestions.push("Completar descripción del producto");
    }

    if (
      (!product.title || product.title.length < 5) &&
      !existingTexts.includes("Revisar título del producto")
    ) {
      suggestions.push("Revisar título del producto");
    }

    setSuggestedTasks(suggestions);
  };

  const addTask = async (customTask) => {
    const text = (customTask ?? task).trim();
    if (text.length < 3 || text.length > 100 || !productId) return;

    const newTask = {
      product_id: productId,
      task: text,
      completed: false,
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/product_tasks`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(newTask),
    });

    if (res.ok) {
      const saved = await res.json();
      setTasks([saved[0], ...tasks]);
      if (!customTask) setTask("");
      setSuccessMessage("Tarea agregada con éxito");
      setTimeout(() => setSuccessMessage(null), 3000);
      setSuggestedTasks(suggestedTasks.filter((s) => s !== text));
    } else {
      setError("No se pudo agregar la tarea");
    }
  };

  const toggleComplete = async (id, current) => {
    await fetch(`${SUPABASE_URL}/rest/v1/product_tasks?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ completed: !current }),
    });
    setTasks(
      tasks.map((t) => (t.id === id ? { ...t, completed: !current } : t)),
    );
  };

  const deleteTask = async (id) => {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/product_tasks?id=eq.${id}`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: "return=representation",
        },
      },
    );

    if (!res.ok) {
      setError("No se pudo eliminar la tarea");
      return;
    }

    setTasks(tasks.filter((t) => t.id !== id));
  };

  const clearCompletedTasks = async () => {
    const completedIds = tasks.filter((t) => t.completed).map((t) => t.id);
    if (completedIds.length === 0) return;

    const deleteQuery =
      completedIds
        .map((id) => `id=eq.${id}`)
        .join("&or=")
        .replace(/or=/g, "or=(") + ")";

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/product_tasks?${deleteQuery}`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: "return=representation",
        },
      },
    );

    if (res.ok) {
      setTasks(tasks.filter((t) => !t.completed));
      setSuccessMessage("Tareas completadas eliminadas");
      setTimeout(() => setSuccessMessage(null), 3000);
    } else {
      setError("No se pudieron eliminar las tareas completadas");
    }
  };

  const allCompleted = tasks.length > 0 && tasks.every((t) => t.completed);

  return (
    <AdminAction
      title="Tareas del producto"
      secondaryAction={<Button onPress={close}>Cerrar</Button>}
    >
      <BlockStack>
        {error && (
          <Banner tone="critical" dismissible onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}
        {successMessage && <Banner tone="success">{successMessage}</Banner>}

        {suggestedTasks.length > 0 && (
          <Box padding="base" border="base" cornerRadius="base">
            <Text fontWeight="bold">Sugerencias automáticas:</Text>
            <BlockStack spacing="base">
              {suggestedTasks.map((text, index) => (
                <InlineStack key={index} inlineAlignment="space-between">
                  <Text>{text}</Text>
                  <Button variant="tertiary" onPress={() => addTask(text)}>
                    Usar
                  </Button>
                </InlineStack>
              ))}
            </BlockStack>
          </Box>
        )}

        <Box border="base" padding="base" cornerRadius="base">
          <BlockStack rowGap="base">
            <TextField
              label="Nueva tarea"
              value={task}
              onChange={setTask}
              placeholder="Ej. revisar descripción"
            />
            <InlineStack columnGap="base" inlineAlignment="end">
              <Button
                variant="primary"
                onPress={() => addTask()}
                disabled={!task.trim()}
              >
                Agregar tarea
              </Button>
            </InlineStack>
          </BlockStack>
        </Box>

        <Divider />

        <BlockStack
          padding="base"
          blockAlignment="center"
          inlineAlignment="center"
          rowGap="base"
        >
          {loading ? (
            <ProgressIndicator size="small-300" />
          ) : (
            <>
              {tasks.length === 0 ? (
                <Text appearance="subdued">No hay tareas registradas.</Text>
              ) : (
                <>
                  {allCompleted && (
                    <Banner tone="success">
                      🎉 ¡Todas las tareas están completadas! El producto está
                      listo para publicar.
                    </Banner>
                  )}

                  <InlineStack
                    inlineAlignment="start"
                    blockAlignment="center"
                    columnGap="base"
                  >
                    <Text fontStyle="italic" fontWeight="bold-300">
                      Tareas actuales
                    </Text>
                    <Badge tone="info" size="base">
                      {tasks.filter((t) => !t.completed).length} pendientes
                    </Badge>
                  </InlineStack>

                  {tasks.map((t) => (
                    <Box key={t.id} border="base" cornerRadius="base">
                      <InlineStack
                        inlineAlignment="space-between"
                        columnGap="base"
                        blockAlignment="center"
                      >
                        <InlineStack
                          inlineAlignment="start"
                          columnGap="base"
                          blockAlignment="center"
                        >
                          <Checkbox
                            checked={t.completed}
                            onChange={() => toggleComplete(t.id, t.completed)}
                          />
                          <Text
                            appearance={t.completed ? "subdued" : "default"}
                          >
                            {t.task}
                          </Text>
                        </InlineStack>

                        <Button
                          variant="tertiary"
                          tone="critical"
                          onPress={() => deleteTask(t.id)}
                        >
                          Eliminar
                        </Button>
                      </InlineStack>
                    </Box>
                  ))}
                </>
              )}
            </>
          )}
        </BlockStack>
      </BlockStack>
    </AdminAction>
  );
}
