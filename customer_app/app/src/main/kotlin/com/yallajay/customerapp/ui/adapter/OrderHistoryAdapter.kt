package com.yallajay.customerapp.ui.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.yallajay.customerapp.R
import com.yallajay.customerapp.model.OrderSummary
import java.text.SimpleDateFormat
import java.util.Locale

class OrderHistoryAdapter(
    private val orders: List<OrderSummary>,
    private val onItemClicked: (OrderSummary) -> Unit
) : RecyclerView.Adapter<OrderHistoryAdapter.OrderViewHolder>() {

    class OrderViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val orderId: TextView = itemView.findViewById(R.id.textViewOrderId)
        val orderStatus: TextView = itemView.findViewById(R.id.textViewOrderStatus)
        val storeName: TextView = itemView.findViewById(R.id.textViewStoreName)
        val orderDate: TextView = itemView.findViewById(R.id.textViewOrderDate)
        val grandTotal: TextView = itemView.findViewById(R.id.textViewGrandTotal)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): OrderViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_order, parent, false)
        return OrderViewHolder(view)
    }

    override fun onBindViewHolder(holder: OrderViewHolder, position: Int) {
        val order = orders[position]

        holder.orderId.text = "#${order.id}"
        holder.orderStatus.text = order.status
        holder.storeName.text = order.storeName
        holder.grandTotal.text = "${order.grandTotal} ل.س"

        try {
            val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
            val outputFormat = SimpleDateFormat("dd MMMM yyyy, hh:mm a", Locale("ar"))
            val date = inputFormat.parse(order.orderPlacedAt)
            holder.orderDate.text = date?.let { outputFormat.format(it) } ?: order.orderPlacedAt
        } catch (e: Exception) {
            holder.orderDate.text = order.orderPlacedAt
        }

        holder.itemView.setOnClickListener {
            onItemClicked(order)
        }
    }

    override fun getItemCount(): Int {
        return orders.size
    }
}
