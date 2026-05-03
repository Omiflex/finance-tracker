<?php
// Add CORS headers to prevent browser security blocks
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Connect to Database
$conn = new mysqli('localhost', 'root', '', 'student_finance');
if ($conn->connect_error) {
    die(json_encode(["success" => false, "error" => "Database connection failed."]));
}

// Read the incoming JSON from app.js
$data = json_decode(file_get_contents("php://input"), true);
$action = $data['action'] ?? '';

// ─── AUTHENTICATION ───
if ($action === 'register') {
    $stmt = $conn->prepare("INSERT INTO users (first_name, email, password) VALUES (?, ?, ?)");
    $stmt->bind_param("sss", $data['firstName'], $data['email'], $data['password']);
    
    if ($stmt->execute()) {
        $userId = $stmt->insert_id;
        // Initialize default budgets for this new user
        $conn->query("INSERT INTO budgets (user_id) VALUES ($userId)");
        echo json_encode(["success" => true, "userId" => $userId]);
    } else {
        echo json_encode(["success" => false, "error" => "Email already exists."]);
    }
}

elseif ($action === 'login') {
    $stmt = $conn->prepare("SELECT id, first_name FROM users WHERE email = ? AND password = ?");
    $stmt->bind_param("ss", $data['email'], $data['password']);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($user = $result->fetch_assoc()) {
        echo json_encode(["success" => true, "user" => $user]);
    } else {
        echo json_encode(["success" => false, "error" => "Invalid credentials."]);
    }
}

// ─── DATA LOADING ───
elseif ($action === 'load_all') {
    $userId = (int)$data['userId'];
    $response = ["success" => true, "expenses" => [], "goals" => [], "budgets" => []];

    // Get Expenses
    $expRes = $conn->query("SELECT * FROM expenses WHERE user_id = $userId ORDER BY expense_date DESC");
    while($row = $expRes->fetch_assoc()) { $response['expenses'][] = $row; }

    // Get Goals
    $goalRes = $conn->query("SELECT * FROM savings_goals WHERE user_id = $userId");
    while($row = $goalRes->fetch_assoc()) { $response['goals'][] = $row; }

    // Get Budgets
    $budRes = $conn->query("SELECT * FROM budgets WHERE user_id = $userId");
    if($row = $budRes->fetch_assoc()) { $response['budgets'] = $row; }

    echo json_encode($response);
}

// ─── EXPENSES ───
elseif ($action === 'add_expense') {
    $stmt = $conn->prepare("INSERT INTO expenses (user_id, description, amount, category, expense_date) VALUES (?, ?, ?, ?, ?)");
    $stmt->bind_param("isdss", $data['userId'], $data['description'], $data['amount'], $data['category'], $data['date']);
    if ($stmt->execute()) { echo json_encode(["success" => true, "id" => $stmt->insert_id]); }
}

elseif ($action === 'delete_expense') {
    $stmt = $conn->prepare("DELETE FROM expenses WHERE id = ? AND user_id = ?");
    $stmt->bind_param("ii", $data['id'], $data['userId']);
    if ($stmt->execute()) { echo json_encode(["success" => true]); }
}

// ─── BUDGETS ───
elseif ($action === 'update_budget') {
    $col = preg_replace('/[^a-zA-Z_]/', '', $data['category']); // Sanitize column name
    $stmt = $conn->prepare("UPDATE budgets SET $col = ? WHERE user_id = ?");
    $stmt->bind_param("di", $data['amount'], $data['userId']);
    if ($stmt->execute()) { echo json_encode(["success" => true]); }
}

// ─── GOALS ───
elseif ($action === 'add_goal') {
    $stmt = $conn->prepare("INSERT INTO savings_goals (user_id, name, target, deadline) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("isds", $data['userId'], $data['name'], $data['target'], $data['deadline']);
    if ($stmt->execute()) { echo json_encode(["success" => true, "id" => $stmt->insert_id]); }
}

elseif ($action === 'contribute_goal') {
    $stmt = $conn->prepare("UPDATE savings_goals SET saved = saved + ? WHERE id = ? AND user_id = ?");
    $stmt->bind_param("dii", $data['amount'], $data['id'], $data['userId']);
    if ($stmt->execute()) { echo json_encode(["success" => true]); }
}

elseif ($action === 'delete_goal') {
    $stmt = $conn->prepare("DELETE FROM savings_goals WHERE id = ? AND user_id = ?");
    $stmt->bind_param("ii", $data['id'], $data['userId']);
    if ($stmt->execute()) { echo json_encode(["success" => true]); }
}

$conn->close();
?>