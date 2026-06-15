<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

$conn = new mysqli('localhost', 'root', '', 'finance_tracker');
if ($conn->connect_error) {
    echo json_encode(["success" => false, "error" => "Database connection failed: " . $conn->connect_error]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
$action = $data['action'] ?? '';

// ─── REGISTER ───
if ($action === 'register') {
    $check = $conn->prepare("SELECT id FROM users WHERE email = ?");
    $check->bind_param("s", $data['email']);
    $check->execute();
    $check->store_result();
    
    if ($check->num_rows > 0) {
        echo json_encode(["success" => false, "error" => "Email already exists."]);
        exit;
    }
    
    $stmt = $conn->prepare("INSERT INTO users (first_name, email, password) VALUES (?, ?, ?)");
    $stmt->bind_param("sss", $data['firstName'], $data['email'], $data['password']);
    
    if ($stmt->execute()) {
        $userId = $stmt->insert_id;
        $conn->query("INSERT INTO budgets (user_id, monthly_budget, food, transport, entertainment, education, housing, other) VALUES ($userId, 1000, 300, 150, 100, 200, 400, 100)");
        echo json_encode(["success" => true, "userId" => $userId, "firstName" => $data['firstName']]);
    } else {
        echo json_encode(["success" => false, "error" => "Registration failed: " . $stmt->error]);
    }
    exit;
}

// ─── LOGIN ───
elseif ($action === 'login') {
    $stmt = $conn->prepare("SELECT id, first_name FROM users WHERE email = ? AND password = ?");
    $stmt->bind_param("ss", $data['email'], $data['password']);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($user = $result->fetch_assoc()) {
        echo json_encode(["success" => true, "userId" => $user['id'], "firstName" => $user['first_name']]);
    } else {
        echo json_encode(["success" => false, "error" => "Invalid email or password."]);
    }
    exit;
}

// ─── LOAD ALL DATA ───
elseif ($action === 'load_all') {
    $userId = (int)$data['userId'];
    $response = ["success" => true, "expenses" => [], "goals" => [], "budgets" => null];

    $expRes = $conn->query("SELECT * FROM expenses WHERE user_id = $userId ORDER BY expense_date DESC");
    while ($row = $expRes->fetch_assoc()) { $response['expenses'][] = $row; }

    $goalRes = $conn->query("SELECT * FROM savings_goals WHERE user_id = $userId");
    while ($row = $goalRes->fetch_assoc()) { $response['goals'][] = $row; }

    $budRes = $conn->query("SELECT * FROM budgets WHERE user_id = $userId");
    if ($row = $budRes->fetch_assoc()) { $response['budgets'] = $row; }

    if (!$response['budgets']) {
        $conn->query("INSERT INTO budgets (user_id, monthly_budget, food, transport, entertainment, education, housing, other) VALUES ($userId, 1000, 300, 150, 100, 200, 400, 100)");
        $budRes = $conn->query("SELECT * FROM budgets WHERE user_id = $userId");
        if ($row = $budRes->fetch_assoc()) { $response['budgets'] = $row; }
    }

    echo json_encode($response);
    exit;
}

// ─── ADD EXPENSE ───
elseif ($action === 'add_expense') {
    $stmt = $conn->prepare("INSERT INTO expenses (user_id, description, amount, category, expense_date) VALUES (?, ?, ?, ?, ?)");
    $stmt->bind_param("isdss", $data['userId'], $data['description'], $data['amount'], $data['category'], $data['date']);
    if ($stmt->execute()) {
        echo json_encode(["success" => true, "id" => $stmt->insert_id]);
    } else {
        echo json_encode(["success" => false, "error" => $stmt->error]);
    }
    exit;
}

// ─── EDIT EXPENSE ───
elseif ($action === 'edit_expense') {
    $stmt = $conn->prepare("UPDATE expenses SET description=?, amount=?, category=?, expense_date=? WHERE id=? AND user_id=?");
    $stmt->bind_param("sdssii", $data['description'], $data['amount'], $data['category'], $data['date'], $data['id'], $data['userId']);
    if ($stmt->execute()) {
        echo json_encode(["success" => true]);
    } else {
        echo json_encode(["success" => false, "error" => $stmt->error]);
    }
    exit;
}

// ─── DELETE EXPENSE ───
elseif ($action === 'delete_expense') {
    $stmt = $conn->prepare("DELETE FROM expenses WHERE id = ? AND user_id = ?");
    $stmt->bind_param("ii", $data['id'], $data['userId']);
    if ($stmt->execute()) {
        echo json_encode(["success" => true]);
    } else {
        echo json_encode(["success" => false, "error" => $stmt->error]);
    }
    exit;
}

// ─── UPDATE MONTHLY BUDGET ───
elseif ($action === 'update_monthly_budget') {
    $stmt = $conn->prepare("UPDATE budgets SET monthly_budget = ? WHERE user_id = ?");
    $stmt->bind_param("di", $data['amount'], $data['userId']);
    if ($stmt->execute()) {
        echo json_encode(["success" => true]);
    } else {
        echo json_encode(["success" => false, "error" => $stmt->error]);
    }
    exit;
}

// ─── UPDATE CATEGORY BUDGET ───
elseif ($action === 'update_budget') {
    $allowedCols = ['food', 'transport', 'entertainment', 'education', 'housing', 'other'];
    $col = preg_replace('/[^a-zA-Z_]/', '', $data['category']);
    if (!in_array($col, $allowedCols)) {
        echo json_encode(["success" => false, "error" => "Invalid category."]);
    } else {
        $stmt = $conn->prepare("UPDATE budgets SET $col = ? WHERE user_id = ?");
        $stmt->bind_param("di", $data['amount'], $data['userId']);
        if ($stmt->execute()) {
            echo json_encode(["success" => true]);
        } else {
            echo json_encode(["success" => false, "error" => $stmt->error]);
        }
    }
    exit;
}

// ─── ADD GOAL ───
elseif ($action === 'add_goal') {
    $stmt = $conn->prepare("INSERT INTO savings_goals (user_id, name, target, deadline, saved) VALUES (?, ?, ?, ?, 0)");
    $stmt->bind_param("isds", $data['userId'], $data['name'], $data['target'], $data['deadline']);
    if ($stmt->execute()) {
        echo json_encode(["success" => true, "id" => $stmt->insert_id]);
    } else {
        echo json_encode(["success" => false, "error" => $stmt->error]);
    }
    exit;
}

// ─── CONTRIBUTE TO GOAL ───
elseif ($action === 'contribute_goal') {
    $stmt = $conn->prepare("UPDATE savings_goals SET saved = LEAST(saved + ?, target) WHERE id = ? AND user_id = ?");
    $stmt->bind_param("dii", $data['amount'], $data['id'], $data['userId']);
    if ($stmt->execute()) {
        $id = (int)$data['id'];
        $userId = (int)$data['userId'];
        $res = $conn->query("SELECT saved, target FROM savings_goals WHERE id = $id AND user_id = $userId");
        $row = $res->fetch_assoc();
        echo json_encode(["success" => true, "saved" => (float)$row['saved'], "target" => (float)$row['target']]);
    } else {
        echo json_encode(["success" => false, "error" => $stmt->error]);
    }
    exit;
}

// ─── DELETE GOAL ───
elseif ($action === 'delete_goal') {
    $stmt = $conn->prepare("DELETE FROM savings_goals WHERE id = ? AND user_id = ?");
    $stmt->bind_param("ii", $data['id'], $data['userId']);
    if ($stmt->execute()) {
        echo json_encode(["success" => true]);
    } else {
        echo json_encode(["success" => false, "error" => $stmt->error]);
    }
    exit;
}

else {
    echo json_encode(["success" => false, "error" => "Unknown action: $action"]);
    exit;
}

$conn->close();
?>