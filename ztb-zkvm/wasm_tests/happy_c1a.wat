(module
  (func $withdraw (export "withdraw") (param $amount i32) (result i32)
    local.get $amount
    i32.const 100
    i32.gt_s
    if
      unreachable
    end
    local.get $amount
  )
  (func $check (export "check") (param $val i32) (result i32)
    local.get $val
    i32.eqz
    if
      unreachable
    end
    local.get $val
  )
  (func $validate (export "validate") (param $x i32) (result i32)
    local.get $x
    i32.const 0
    i32.lt_s
    if
      unreachable
    end
    local.get $x
  )
)
